import Homey, {
  BleAdvertisement,
  BlePeripheral,
  BleService,
  BleCharacteristic,
} from 'homey'

import {
  MotionCalibrationType,
  MotionSpeedLevel,
  MotionConnectionType,
  MotionService,
  MotionCharacteristic,
  MotionNotificationType,
  Settings as Setting,
  MotionCapability,
} from '../const'
import MotionCommand from '../command'
import MotionNotification from '../notification'
import MotionCrypt from '../crypt'

class MotionPositionInfo {
  up: boolean
  down: boolean
  favorite: boolean

  constructor(endPositionByte: number, favoriteBytes: number) {
    this.up = Boolean(endPositionByte & 0x08)
    this.down = Boolean(endPositionByte & 0x04)
    this.favorite = Boolean(favoriteBytes & 0x8000)
  }

  /**
   * Updates the end positions.
   * @param {number} endPositionByte the byte containing information about end positions.
   */
  updateEndPositions(endPositionByte: number): void {
    this.up = Boolean(endPositionByte & 0x08)
    this.down = Boolean(endPositionByte & 0x04)
  }
}

class ConnectionQueue {
  #lastCallerResolve:
    | ((isConnected: boolean, isLastCaller: boolean) => void)
    | undefined
    | null
  #cancelConnecting: (() => void) | undefined
  #abortConnecting: AbortController | undefined

  /**
   * Waits for a connection, only returns true to the last caller if the connection is successful.
   * @param {MotionDevice} device the device used to make the connection
   * @returns {boolean} whether or not the motor is ready for a command
   */
  async waitForConnection(device: GenericDevice): Promise<boolean> {
    // If not connecting yet
    if (this.#lastCallerResolve === undefined) {
      this.#lastCallerResolve = null

      try {
        this.#abortConnecting = new AbortController()
        const connected = await device.establishConnection(
          this.#abortConnecting.signal,
        )

        if (!connected) device.log('Cancelled connecting')

        // If this is the last caller, then reset and return whether or not cancelled
        if (!this.#lastCallerResolve) {
          this.reset()
          return connected ? true : false
        } else {
          ;(
            this.#lastCallerResolve as (
              isConnected: boolean,
              isLastCaller: boolean,
            ) => void
          )(connected ? true : false, true)
          return false
        }
      } catch (e) {
        // Not connected due to error

        if (this.#lastCallerResolve) {
          ;(
            this.#lastCallerResolve as (
              isConnected: boolean,
              isLastCaller: boolean,
            ) => void
          )(false, true)
        } else {
          this.reset()
        }
        throw e
      }
    } else {
      // If connecting already, resolve the laster caller to false and wait
      device.log('Already connecting, waiting for connection...')
      if (this.#lastCallerResolve)
        (
          this.#lastCallerResolve as (
            isConnected: boolean,
            isLastCaller: boolean,
          ) => void
        )(false, false)
      return new Promise(resolve => {
        this.#lastCallerResolve = function (
          isConnected: boolean,
          isLastCaller: boolean,
        ) {
          resolve(isConnected && isLastCaller)
          if (isLastCaller) this.reset()
        }
      })
    }
  }

  /**
   * Resets the connection queue.
   */
  reset(): void {
    this.#lastCallerResolve = undefined
    this.#abortConnecting = undefined
  }

  /**
   * Cancels connecting to the motor.
   */
  cancel(device: GenericDevice): void {
    if (this.#abortConnecting) {
      device.log('Cancelling connecting...')
      this.#abortConnecting.abort()
    }
    if (this.#lastCallerResolve) this.#lastCallerResolve(false, true)
  }
}

class GenericDevice extends Homey.Device {
  #peripheral: BlePeripheral | undefined
  #peripheralUUID: string = this.getData().uuid
  #updateInterval: NodeJS.Timer | undefined
  #disconnectTimerID: NodeJS.Timeout | undefined
  #disconnectTime: number | undefined
  #commandCharacteristic: BleCharacteristic | undefined
  #notificationCharacteristic: BleCharacteristic | undefined
  #connectionQueue: ConnectionQueue = new ConnectionQueue()

  #lastPosition: number | undefined
  #lastAngle: number | undefined

  #endPositionInfo: MotionPositionInfo | undefined
  #foundEndPositionsCallback: (() => void) | undefined

  #lastIdleClickTime: number = 0
  #lastPressedCapability: MotionCapability | null = null

  /**
   * Register a listener for a capability change event.
   * This is invoked when a device's state change is requested.
   * @param {MotionCapability} capability
   * @param {Device.CapabilityCallback} listener
   */
  registerCapabilityListener<TValue, TOpts>(
    capability: MotionCapability,
    listener: Homey.Device.CapabilityCallback,
  ): void {
    if (this.hasCapability(capability))
      super.registerCapabilityListener(
        capability,
        (value: TValue, opts: TOpts) => {
          this.#lastPressedCapability = capability
          listener(value, opts)
        },
      )
  }

  /**
   * Set a device's capability value, if the device has that capability.
   * @param {MotionCapability} capability
   * @param {any} value
   * @returns {Promise<void>}
   */
  async setCapabilityValue<T>(
    capability: MotionCapability,
    value: T | null,
  ): Promise<void> {
    if (this.hasCapability(capability))
      await super.setCapabilityValue(capability, value)
  }

  /**
   * Get a device's capability value, if the device has that capability.
   * @param {MotionCapability} capability
   * @returns {T} The value, `null` when unknown, or undefined if the device doesn't have that capability
   */
  async getCapabilityValue<T>(
    capability: MotionCapability,
  ): Promise<T | null | undefined> {
    if (this.hasCapability(capability)) {
      return (await super.getCapabilityValue(capability)) as T
    }
    return undefined
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded(): Promise<void> {
    this.log(
      `${this.constructor.name} (${this.#peripheralUUID}) has been added`,
    )
    this.handleLatestAdvertisement()
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit(): Promise<void> {
    this.log(
      `${this.constructor.name} (${this.#peripheralUUID}) has been initialized`,
    )
    await this.setCapabilityValue<MotionConnectionType>(
      MotionCapability.CONNECTED_SENSOR,
      MotionConnectionType.DISCONNECTED,
    )
    await this.setCapabilityValue<number>(
      MotionCapability.POSITION_SLIDER,
      null,
    )
    await this.setCapabilityValue<number>(MotionCapability.TILT_SLIDER, null)
    await this.setCapabilityValue<MotionSpeedLevel>(
      MotionCapability.SPEED_PICKER,
      null,
    )
    await this.setCapabilityValue<MotionCalibrationType>(
      MotionCapability.CALIBRATED,
      null,
    )

    // Handle slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener<number, undefined>(
      MotionCapability.POSITION_SLIDER,
      async (position: number) => {
        if (!(await this.connect())) return
        await this.handleEndPositions()

        position = 100 - Math.ceil(position * 100)
        const percentageCommand: Buffer = MotionCommand.percentage(position)
        await this.#commandCharacteristic?.write(percentageCommand)
      },
    )

    // Handle button clicks, strings: up, idle, down
    this.registerCapabilityListener<string, undefined>(
      MotionCapability.BUTTONS,
      async (state: string) => {
        if (!(await this.connect())) return

        let stateCommand: Buffer = Buffer.from('')
        switch (state) {
          case 'up': {
            await this.handleEndPositions()
            stateCommand = MotionCommand.up()
            break
          }
          case 'idle': {
            const currentIdleClickTime = Date.now()
            if (
              this.#lastIdleClickTime != undefined &&
              currentIdleClickTime - this.#lastIdleClickTime < 500
            ) {
              this.#lastIdleClickTime = 0
              await this.handleEndPositions()
              await this.handleFavoritePosition()
              stateCommand = MotionCommand.favorite()
            } else {
              this.#lastIdleClickTime = currentIdleClickTime
              stateCommand = MotionCommand.stop()
            }
            break
          }
          case 'down': {
            await this.handleEndPositions()
            stateCommand = MotionCommand.down()
            break
          }
          default: {
            this.error(`Could not find state: ${state}`)
            return
          }
        }

        this.log(`Sending ${MotionCrypt.decrypt(stateCommand.toString('hex'))}`)
        await this.#commandCharacteristic?.write(stateCommand)
      },
    )

    // Handle button pressed value changes
    this.registerCapabilityListener<boolean, undefined>(
      MotionCapability.DISCONNECT,
      async (_pressed: boolean) => {
        await this.setCapabilityValue<boolean>(
          MotionCapability.DISCONNECT,
          false,
        )
        await this.disconnect()
      },
    )

    // Handle button pressed value changes
    this.registerCapabilityListener<boolean, undefined>(
      MotionCapability.CONNECT,
      async (_pressed: boolean) => {
        await this.setCapabilityValue<boolean>(MotionCapability.CONNECT, false)
        if (!(await this.connect())) return
      },
    )

    // Handle button pressed value changes
    this.registerCapabilityListener<boolean, undefined>(
      MotionCapability.FAVORITE,
      async (_pressed: boolean) => {
        await this.setCapabilityValue<boolean>(MotionCapability.FAVORITE, false)
        if (!(await this.connect())) return
        await this.handleEndPositions()
        await this.handleFavoritePosition()
        await this.#commandCharacteristic?.write(MotionCommand.favorite())
      },
    )

    // Handle speed value changes (1 = LOW, 2 = MEDIUM, 3 = HIGH)
    this.registerCapabilityListener<string, undefined>(
      MotionCapability.SPEED_PICKER,
      async (key: string) => {
        if (!(await this.connect())) return
        const speed_level: MotionSpeedLevel = Number.parseInt(key)
        this.#commandCharacteristic?.write(MotionCommand.speed(speed_level))
      },
    )

    // Handle tilt slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener<number, undefined>(
      MotionCapability.TILT_SLIDER,
      async (angle: number) => {
        if (!(await this.connect())) return
        await this.handleEndPositions()
        angle = 180 - Math.round(180 * angle)
        this.log(angle)
        const tiltCommand: Buffer = MotionCommand.tilt(angle)
        await this.#commandCharacteristic?.write(tiltCommand)
      },
    )

    // Update the RSSI
    await this.handleLatestAdvertisement()

    // Update the RSSI with interval
    this.#updateInterval = setInterval(async () => {
      await this.handleLatestAdvertisement()
    }, Setting.UPDATE_INTERVAL * 1000)
  }

  /**
   * Function that waits for the end position information to become known.
   */
  async waitForEndPositionInfo(): Promise<void> {
    if (!this.#endPositionInfo)
      await new Promise<void>((resolve: () => void) => {
        this.#foundEndPositionsCallback = () => {
          resolve()
          this.#foundEndPositionsCallback = undefined
        }
      })
  }

  /**
   * Handles information about the favorite position, throws an error if not set.
   */
  async handleFavoritePosition(): Promise<void> {
    await this.waitForEndPositionInfo()

    if (!this.#endPositionInfo?.favorite)
      throw new Error(
        `${this.getName()}'s favorite position needs to be set before usage of this command.`,
      )
  }

  /**
   * Handles information about the end positions, throws an error if not set.
   */
  async handleEndPositions(): Promise<void> {
    await this.waitForEndPositionInfo()

    if (this.constructor.name == 'CurtainBlindDevice') {
      // If no end positions are set for a curtain blind, then continue by sending a position command which will calibrate the blind
      if (!this.#endPositionInfo?.up) {
        this.log('Calibrating...')
        this.setCapabilityValue<MotionCalibrationType>(
          MotionCapability.CALIBRATED,
          MotionCalibrationType.CALIBRATING,
        )
        this.refreshDisconnectTimer(Setting.CALIBRATION_TIME)
      }
    } else if (this.constructor.name == 'VerticalBlindDevice') {
      // If no end positions are set for a vertical blind, then throw an error
      if (!this.#endPositionInfo?.up) {
        this.setCapabilityValue<MotionCalibrationType>(
          MotionCapability.CALIBRATED,
          MotionCalibrationType.UNCALIBRATED,
        )
        throw new Error(
          `${this.getName()} needs to be calibrated using the MotionBlinds BLE app before usage.`,
        )
      }
    } else {
      // If no end positions are set, then throw an error
      if (!this.#endPositionInfo?.up)
        throw new Error(
          `${this.getName()}'s end positions need to be set before usage of this command.`,
        )
    }
  }

  /**
   * Handles an advertisement, updates the RSSI value.
   * @param {BleAdvertisement} advertisement the advertisement to handle
   */
  async handleLatestAdvertisement(
    advertisement: BleAdvertisement | null = null,
  ): Promise<void> {
    try {
      advertisement = advertisement
        ? advertisement
        : await this.homey.ble.find(this.#peripheralUUID, Setting.FIND_TIME)
      await this.setCapabilityValue<string>(
        MotionCapability.RSSI,
        `${advertisement.rssi} dBm`,
      )
    } catch (e) {
      await this.setCapabilityValue<string>(MotionCapability.RSSI, `Not found`)
    }
  }

  /**
   * Used to see if the motor is connected to.
   * @returns {boolean} whether the motor is connected
   */
  isConnected(): boolean {
    return (
      this.#commandCharacteristic != undefined &&
      this.#commandCharacteristic.service.peripheral.isConnected
    )
  }

  /**
   * Connects to the motor.
   * @returns {boolean} whether or not the motor is ready for a command
   */
  async connect(): Promise<boolean> {
    if (!this.isConnected())
      return await this.#connectionQueue.waitForConnection(this)
    this.refreshDisconnectTimer(Setting.DISCONNECT_TIME)
    return true
  }

  /**
   * Establishes a connection to the motor.
   * @returns {boolean} whether the motor is connected
   */
  async establishConnection(abortSignal: AbortSignal): Promise<boolean> {
    try {
      await this.setCapabilityValue<MotionConnectionType>(
        MotionCapability.CONNECTED_SENSOR,
        MotionConnectionType.CONNECTING,
      )
      this.log(`Finding device ${this.#peripheralUUID}...`)
      if (abortSignal.aborted) return false
      const advertisement: BleAdvertisement = await this.homey.ble.find(
        this.#peripheralUUID,
        Setting.FIND_TIME,
      )
      await this.setCapabilityValue<string>(
        MotionCapability.RSSI,
        `${advertisement.rssi} dBm`,
      )

      this.log('Connecting to device...')
      if (abortSignal.aborted) return false
      this.#peripheral = await advertisement.connect()
      this.#peripheral.once('disconnect', () => {
        this.log('The device has disconnected!')
        this.disconnect()
      })
      // this.log(await peripheral.discoverAllServicesAndCharacteristics())
      if (abortSignal.aborted) return false
      this.log('Getting service...')
      const service: BleService = await this.#peripheral.getService(
        MotionService.CONTROL,
      )
      if (abortSignal.aborted) return false
      this.log('Getting characteristic...')
      this.#commandCharacteristic = await service.getCharacteristic(
        MotionCharacteristic.COMMAND,
      )
      if (abortSignal.aborted) return false
      this.#notificationCharacteristic = await service.getCharacteristic(
        MotionCharacteristic.NOTIFICATION,
      )
      if (abortSignal.aborted) return false
      await this.setCapabilityValue<MotionConnectionType>(
        MotionCapability.CONNECTED_SENSOR,
        MotionConnectionType.CONNECTED,
      )
      if (abortSignal.aborted) return false
      this.log('Subscribing to notifications...')
      await this.#notificationCharacteristic?.subscribeToNotifications(
        ((notification: Buffer) => this.notificationHandler(notification)).bind(
          this,
        ),
      )
      if (abortSignal.aborted) return false
      this.log('Setting user key...')
      const userKeyCommand: Buffer = MotionCommand.setKey()
      await this.#commandCharacteristic.write(userKeyCommand)
      const statusQueryCommand: Buffer = MotionCommand.statusQuery()
      if (abortSignal.aborted) return false
      await this.#commandCharacteristic.write(statusQueryCommand)
      this.refreshDisconnectTimer(Setting.DISCONNECT_TIME)
      this.log('Ready to send command')
      return true
    } catch (e) {
      await this.setCapabilityValue<MotionConnectionType>(
        MotionCapability.CONNECTED_SENSOR,
        MotionConnectionType.DISCONNECTED,
      )
      throw e
    }
  }

  /**
   * Handles incoming BLE notifications from the client.
   * @param {Buffer} notificationBuffer a Buffer containing the bytes of information
   */
  async notificationHandler(notificationBuffer: Buffer): Promise<void> {
    if (notificationBuffer.length % 16 == 0) {
      this.log('Received encrypted notification.')
      const decryptedNotificationString: string =
        MotionNotification.decryptDecode(notificationBuffer)
      this.log(decryptedNotificationString)
      const decryptedNotificationBuffer: Buffer =
        MotionNotification.decrypt(notificationBuffer)

      if (
        decryptedNotificationString.startsWith(MotionNotificationType.PERCENT)
      ) {
        const new_position: number = 1 - decryptedNotificationBuffer[6] / 100
        const new_angle =
          1 - Math.round((decryptedNotificationBuffer[7] / 180) * 100) / 100
        this.log(`Percentage: ${new_position}`)
        this.log(`Angle: ${new_angle}`)
        // Only update if position feedback and angle feedback are not equal to previous feedback
        if (
          new_position != this.#lastPosition ||
          new_angle != this.#lastAngle
        ) {
          await this.setCapabilityValue<number>(
            MotionCapability.POSITION_SLIDER,
            new_position,
          )
          await this.setCapabilityValue<number>(
            MotionCapability.TILT_SLIDER,
            new_angle,
          )
          this.#lastPosition = new_position
          this.#lastAngle = new_angle
        }

        this.#endPositionInfo?.updateEndPositions(
          decryptedNotificationBuffer[4],
        )
        if (this.#endPositionInfo && this.#endPositionInfo.up) {
          if (
            (await this.getCapabilityValue<MotionCalibrationType>(
              MotionCapability.CALIBRATED,
            )) == MotionCalibrationType.CALIBRATING
          )
            this.refreshDisconnectTimer(Setting.DISCONNECT_TIME, true)
          this.setCapabilityValue<MotionCalibrationType>(
            MotionCapability.CALIBRATED,
            MotionCalibrationType.CALIBRATED,
          )
        }
      } else if (
        decryptedNotificationString.startsWith(MotionNotificationType.STATUS)
      ) {
        const new_position: number = 1 - decryptedNotificationBuffer[6] / 100
        const new_angle =
          1 - Math.round((decryptedNotificationBuffer[7] / 180) * 100) / 100
        if (
          this.#lastPressedCapability != MotionCapability.POSITION_SLIDER &&
          this.#lastPressedCapability != MotionCapability.TILT_SLIDER
        ) {
          await this.setCapabilityValue<number>(
            MotionCapability.POSITION_SLIDER,
            new_position,
          )
          await this.setCapabilityValue<number>(
            MotionCapability.TILT_SLIDER,
            new_angle,
          )
        }
        this.#lastPosition = new_position
        this.#lastAngle = new_angle

        const speedLevel = decryptedNotificationBuffer[12]
        if (this.#lastPressedCapability != MotionCapability.SPEED_PICKER) {
          await this.setCapabilityValue<string>(
            MotionCapability.SPEED_PICKER,
            speedLevel in MotionSpeedLevel ? speedLevel.toString() : null,
          )
        }

        const batteryPercentage: number = decryptedNotificationBuffer[17]
        await this.setCapabilityValue<string>(
          MotionCapability.BATTERY_SENSOR,
          `${batteryPercentage}%`,
        )

        this.#endPositionInfo = new MotionPositionInfo(
          decryptedNotificationBuffer[4],
          (decryptedNotificationBuffer[14] << 8) |
            decryptedNotificationBuffer[15],
        )
        if (this.#foundEndPositionsCallback) {
          this.#foundEndPositionsCallback()
        } else {
          await this.setCapabilityValue<MotionCalibrationType>(
            MotionCapability.CALIBRATED,
            this.#endPositionInfo.up
              ? MotionCalibrationType.CALIBRATED
              : MotionCalibrationType.UNCALIBRATED,
          )
        }
      }
    } else {
      this.error(`Unknown message ${notificationBuffer}`)
    }
  }

  /**
   * Refreshes the time after which the motor is disconnected.
   * @param {number} time the time in seconds after which to disconnect
   * @param {boolean} force whether or not to force a refresh of the disconnect timer
   */
  refreshDisconnectTimer(time: number, force: boolean = false): void {
    // Check if disconnect time is not smaller than existing disconnect time
    const newDisconnectTime = Date.now() + time * 1000
    if (
      this.#disconnectTime &&
      this.#disconnectTime > newDisconnectTime &&
      !force
    )
      return
    this.#disconnectTime = newDisconnectTime

    // Delete previous timer
    if (this.#disconnectTimerID) clearTimeout(this.#disconnectTimerID)

    this.#disconnectTimerID = setTimeout(
      (async () => {
        await this.disconnect()
      }).bind(this),
      time * 1000,
    )
  }

  /**
   * Disconnects from the motor.
   */
  async disconnect() {
    this.#connectionQueue.cancel(this)

    await this.setCapabilityValue<MotionConnectionType>(
      MotionCapability.CONNECTED_SENSOR,
      MotionConnectionType.DISCONNECTED,
    )
    await this.setCapabilityValue<number>(
      MotionCapability.POSITION_SLIDER,
      null,
    )
    await this.setCapabilityValue<number>(MotionCapability.TILT_SLIDER, null)
    await this.setCapabilityValue<MotionCalibrationType>(
      MotionCapability.CALIBRATED,
      null,
    )
    await this.setCapabilityValue<MotionSpeedLevel>(
      MotionCapability.SPEED_PICKER,
      null,
    )

    if (this.#commandCharacteristic?.service.peripheral.isConnected)
      await this.#commandCharacteristic?.service.peripheral.disconnect()
    this.#commandCharacteristic = undefined
    this.#lastPressedCapability = null
    this.#lastPosition = undefined
    this.#lastAngle = undefined
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings: _oldSettings,
    newSettings: _newSettings,
    changedKeys: _changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null }
    newSettings: { [key: string]: boolean | string | number | undefined | null }
    changedKeys: string[]
  }): Promise<string | void> {
    this.log(
      `${this.constructor.name} (${this.#peripheralUUID})'s settings were changed`,
    )
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} _name The new name
   */
  async onRenamed(_name: string) {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) was renamed`)
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log(
      `${this.constructor.name} (${this.#peripheralUUID}) has been deleted`,
    )
    if (this.#updateInterval) {
      clearInterval(this.#updateInterval)
      this.#updateInterval = undefined
    }
  }
}

export default GenericDevice

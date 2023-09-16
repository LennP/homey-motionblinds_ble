import Homey, { BleAdvertisement, BlePeripheral, BleService, BleCharacteristic } from 'homey';

import { MotionCalibrationType, MotionSpeedLevel, MotionConnectionType, MotionService, MotionCharacteristic, MotionNotificationType, Settings as Setting, MotionCapability } from '../const'
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
    this.favorite = Boolean((favoriteBytes & 0xFF00) != 0x00 || (favoriteBytes & 0x00FF))
  }

  updateEndPositions(endPositionByte: number): void {
    this.up = Boolean(endPositionByte & 0x08)
    this.down = Boolean(endPositionByte & 0x04)
  }
}

class ConnectionQueue {

  #lastCallerResolve: ((lastCallerConnected: boolean) => void) | undefined | null;

  async waitForConnection(device: GenericDevice): Promise<boolean> {
    if (this.#lastCallerResolve === undefined) {
      this.#lastCallerResolve = null
      
      device.log("Connecting to motor...")
      try {
        await device.establish_connection()

        if (this.#lastCallerResolve) {
          (this.#lastCallerResolve as (val: boolean) => void)(true);
          return false
        } else {
          this.#lastCallerResolve = undefined
          return true
        }
      } catch (e) {

        if (this.#lastCallerResolve) {
          (this.#lastCallerResolve as (val: boolean) => void)(false);
        }
        this.#lastCallerResolve = undefined
        throw e
      }
      
    } else {
      device.log("Already connecting, waiting for connection...")
      if (this.#lastCallerResolve)
        this.#lastCallerResolve(false)
      return new Promise((resolve) => {
          this.#lastCallerResolve = function(lastCallerConnected: boolean) {
            resolve(lastCallerConnected)
            if (lastCallerConnected)
              this.#lastCallerResolve = undefined
        }
      })
    }

  }

}

class GenericDevice extends Homey.Device {

  #peripheralUUID: string = this.getData().uuid
  #connecting: boolean = false
  #updateInterval: NodeJS.Timer | undefined
  #disconnectTimerID: NodeJS.Timeout | undefined
  #disconnectTime: number | undefined
  #commandCharacteristic: BleCharacteristic | undefined
  #notificationCharacteristic: BleCharacteristic | undefined
  #connectionQueue: ConnectionQueue = new ConnectionQueue()

  #calibrationType: MotionCalibrationType | undefined

  #endPositionInfo: MotionPositionInfo | undefined
  #foundEndPositionsCallback: Function | undefined

  #lastIdleClickTime: number = 0

  registerCapabilityListener(capability: MotionCapability, listener: Homey.Device.CapabilityCallback): void {
    if (this.hasCapability(capability))
      super.registerCapabilityListener(capability, listener)
  }

  async setCapabilityValue(capability: MotionCapability, value: any): Promise<void> {
    if (this.hasCapability(capability))
      await super.setCapabilityValue(capability, value)
  }

  /**
  * onAdded is called when the user adds the device, called just after pairing.
  */
  async onAdded(): Promise<void> {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) has been added`);
    this.handleLatestAdvertisement()
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit(): Promise<void> {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) has been initialized`);
    await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.DISCONNECTED)
    await this.setCapabilityValue(MotionCapability.SPEED_PICKER, null)
    await this.setCapabilityValue(MotionCapability.CALIBRATED, null)

    // Handle slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener(MotionCapability.POSITION_SLIDER, async (position) => {
      await this.connect()
      await this.handleEndPositions()
      
      position = 100 - Math.ceil(position * 100)
      const percentageCommand: Buffer = MotionCommand.percentage(position)
      await this.#commandCharacteristic?.write(percentageCommand)
      this.log(position)
    })

    // Handle button clicks, strings: up, idle, down
    this.registerCapabilityListener(MotionCapability.BUTTONS, async (state) => {
      await this.connect()
    
      let stateCommand: Buffer = Buffer.from('')
      switch(state) {
        case "up": {
          await this.handleEndPositions()
          stateCommand = MotionCommand.up()
          break
        }
        case "idle": {
          const currentIdleClickTime = Date.now()
          if (this.#lastIdleClickTime != undefined && currentIdleClickTime - this.#lastIdleClickTime < 500) {
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
        case "down": {
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
    
    })

    // Handle button pressed value changes
    this.registerCapabilityListener(MotionCapability.FAVORITE, async (pressed: boolean) => {
      await this.setCapabilityValue(MotionCapability.FAVORITE, false)
      await this.connect()
      await this.handleEndPositions()
      await this.#commandCharacteristic?.write(MotionCommand.favorite())
    })

    // Handle speed value changes
    this.registerCapabilityListener(MotionCapability.SPEED_PICKER, async (key: string) => {
      await this.connect()
      await this.handleEndPositions()
      await this.handleFavoritePosition()
      const speed_level: MotionSpeedLevel = Number.parseInt(key)
      this.#commandCharacteristic?.write(MotionCommand.speed(speed_level))
    })

    // Handle tilt slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener(MotionCapability.TILT_SLIDER, async (angle: number) => {
      await this.connect()
      await this.handleEndPositions()
      angle = 180 - Math.round(180 * angle)
      this.log(angle)
      const tiltCommand: Buffer = MotionCommand.tilt(angle)
      await this.#commandCharacteristic?.write(tiltCommand)
    })

    await this.handleLatestAdvertisement()

    // Update the RSSI with interval
    this.#updateInterval = setInterval(async () => {
      await this.handleLatestAdvertisement()
    }, Setting.UPDATE_INTERVAL * 1000)

  }

  async waitForEndPositionInfo(): Promise<void> {
    if (!this.#endPositionInfo)
      await new Promise<void>(((resolve: Function) => {
        this.#foundEndPositionsCallback = (() => {
          resolve()
          this.#foundEndPositionsCallback = undefined
        })
      }))
  }


  async handleFavoritePosition(): Promise<void> {

    await this.waitForEndPositionInfo()

    if (!this.#endPositionInfo?.favorite)
      throw new Error(`${this.getName()}'s favorite position needs to be set before usage of this command.`)

  }

  async handleEndPositions(): Promise<void> {

    await this.waitForEndPositionInfo()

    if (this.constructor.name == "CurtainBlindDevice") {
      if (!this.#endPositionInfo?.up) {
        this.log("Calibrating...")
        this.#calibrationType = MotionCalibrationType.CALIBRATING
        this.setCapabilityValue(MotionCapability.CALIBRATED, MotionCalibrationType.CALIBRATING)
        this.refreshDisconnectTimer(Setting.CALIBRATION_TIME)
        // Continue with command
      }
    } else if (this.constructor.name == "VerticalBlindDevice") {
      if (!this.#endPositionInfo?.up)
        this.#calibrationType = MotionCalibrationType.UNCALIBRATED
        this.setCapabilityValue(MotionCapability.CALIBRATED, MotionCalibrationType.UNCALIBRATED)
        throw new Error(`${this.getName()} needs to be calibrated using the MotionBlinds BLE app before usage.`)
    } else {
      if (!this.#endPositionInfo?.up)
        throw new Error(`${this.getName()}'s end positions need to be set before usage of this command.`)
    }
    
  }

  async handleLatestAdvertisement(advertisement: BleAdvertisement | null = null): Promise<BleAdvertisement | null> {
    try {
      advertisement = advertisement ? advertisement : await this.homey.ble.find(this.#peripheralUUID, Setting.FIND_TIME)
      await this.setCapabilityValue(MotionCapability.RSSI, `${advertisement.rssi} dBm`)
    } catch (e) {
      await this.setCapabilityValue(MotionCapability.RSSI, `Not found`)
    }
    return advertisement
  }

  setIsConnecting(connecting: boolean): void {
    this.#connecting = connecting
  }

  isConnecting(): boolean {
    return this.#connecting
  }

  isConnected(): boolean {
    return this.#commandCharacteristic != undefined && this.#commandCharacteristic.service.peripheral.isConnected
  }

  async connect(): Promise<void> {
    if (!this.isConnected())
      await this.#connectionQueue.waitForConnection(this)
    this.refreshDisconnectTimer(Setting.DISCONNECT_TIME)
  }

  async establish_connection(): Promise<void> {
    try {
      await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.CONNECTING)
      this.setIsConnecting(true)
      this.log(`Finding device ${this.#peripheralUUID}...`)
      const advertisement: BleAdvertisement = await this.homey.ble.find(this.#peripheralUUID, Setting.FIND_TIME)
      await this.setCapabilityValue(MotionCapability.RSSI, `${advertisement.rssi} dBm`)

      this.log('Connecting to device...')
      const peripheral: BlePeripheral = await advertisement.connect()
      this.log('Getting service...')
      // this.log(await peripheral.discoverAllServicesAndCharacteristics())
      const service: BleService = await peripheral.getService(MotionService.CONTROL)
      this.log('Getting characteristic...')
      this.#commandCharacteristic = await service.getCharacteristic(MotionCharacteristic.COMMAND)
      this.#notificationCharacteristic = await service.getCharacteristic(MotionCharacteristic.NOTIFICATION)
      this.log("Subscribing to notifications...")
      await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.CONNECTED)
      await this.#notificationCharacteristic?.subscribeToNotifications(((notification: Buffer) => this.notificationHandler(notification)).bind(this))
      this.log("Setting user key...")
      const userKeyCommand: Buffer = MotionCommand.setKey()
      await this.#commandCharacteristic.write(userKeyCommand)
      const statusQueryCommand: Buffer = MotionCommand.statusQuery()
      await this.#commandCharacteristic.write(statusQueryCommand)
      this.refreshDisconnectTimer(Setting.DISCONNECT_TIME)
      this.log("Ready to send command")
      this.setIsConnecting(false)

    } catch (e) {
      await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.DISCONNECTED)
      throw e
    }
  }

  async notificationHandler(notificationBuffer: Buffer): Promise<void> {
    if (notificationBuffer.length % 16 == 0) {
      this.log("Received encrypted notification.")
      const decryptedNotificationString: string = MotionNotification._decode_decrypt(notificationBuffer)
      this.log(decryptedNotificationString)
      const decryptedNotificationBuffer: Buffer = MotionNotification._decrypt(notificationBuffer)
      if (decryptedNotificationString.startsWith(MotionNotificationType.PERCENT)) {
        const position: number = 1 - decryptedNotificationBuffer[6] / 100
        const angle = 1 - Math.round((decryptedNotificationBuffer[7] / 180) * 100) / 100

        this.#endPositionInfo?.updateEndPositions(decryptedNotificationBuffer[4])
        if (this.#endPositionInfo && this.#endPositionInfo.up) {
          if (this.#calibrationType && this.#calibrationType == MotionCalibrationType.CALIBRATING)
            this.refreshDisconnectTimer(Setting.DISCONNECT_TIME, true)
          this.#calibrationType = MotionCalibrationType.CALIBRATED
          this.setCapabilityValue(MotionCapability.CALIBRATED, MotionCalibrationType.CALIBRATED)
        }

        this.log(`Percentage: ${position}`)
        this.log(`Angle: ${angle}`)
        await this.setCapabilityValue(MotionCapability.POSITION_SLIDER, position)
        await this.setCapabilityValue(MotionCapability.TILT_SLIDER, angle)
      } else if (decryptedNotificationString.startsWith(MotionNotificationType.STATUS)) {
        const position: number = decryptedNotificationBuffer[6] / 100
        const angle = Math.round((decryptedNotificationBuffer[7] / 180) * 100) / 100
        const speedLevel = decryptedNotificationBuffer[12]
        const batteryPercentage: number = decryptedNotificationBuffer[17]
        this.log(`Battery percentage: ${batteryPercentage}`)
        await this.setCapabilityValue(MotionCapability.BATTERY_SENSOR, `${batteryPercentage}%`)
        try {
          await this.setCapabilityValue(MotionCapability.SPEED_PICKER, speedLevel.toString())
        } catch (e) {
          this.log(`Invalid speed level: ${speedLevel}`)
        }
        this.#endPositionInfo = new MotionPositionInfo(decryptedNotificationBuffer[4], (decryptedNotificationBuffer[6] << 8) | decryptedNotificationBuffer[7])
        if (this.#foundEndPositionsCallback)
          this.#foundEndPositionsCallback()
      }
    } else {
      this.error(`Unknown message ${notificationBuffer}`)
    }
  }

  refreshDisconnectTimer(time: number, force: boolean = false): void {
    // Check if disconnect time is not smaller than existing disconnect time
    const newDisconnectTime = Date.now() + time * 1000
    if ((this.#disconnectTime && this.#disconnectTime > newDisconnectTime) && !force)
      return
    this.#disconnectTime = newDisconnectTime

    // Delete previous timer
    if (this.#disconnectTimerID)
      clearTimeout(this.#disconnectTimerID)
    
    this.#disconnectTimerID = setTimeout((async () => {
        await this.disconnect()
    }).bind(this), time * 1000)
  }

  async disconnect() {
    this.log(`Disconnecting after ${Setting.DISCONNECT_TIME}s`)
    await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.DISCONNECTED)
    await this.setCapabilityValue(MotionCapability.CALIBRATED, null)
    this.#calibrationType = undefined
    await this.#commandCharacteristic?.service.peripheral.disconnect()
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
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) settings where changed`);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) was renamed`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) has been deleted`);
    if (this.#updateInterval) {
      clearInterval(this.#updateInterval)
      this.#updateInterval = undefined
    }
  }

}

export default GenericDevice;

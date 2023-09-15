import Homey, { BleAdvertisement, BlePeripheral, BleService, BleCharacteristic } from 'homey';

import { MotionSpeedLevel, MotionConnectionType, MotionService, MotionCharacteristic, MotionNotificationType, Settings, MotionCapability } from '../const'
import MotionCommand from '../command'
import MotionNotification from '../notification'
import MotionCrypt from '../crypt'
import EventEmitter from 'events';

class ConnectionQueue {

  static connectedEvent: EventEmitter | undefined
  static lastCallerTime: number | undefined
  static callersWaiting: number = 0

  static async waitForConnection(device: GenericDevice) {
    ConnectionQueue.callersWaiting++
    const callerTime = Date.now()
    ConnectionQueue.lastCallerTime = callerTime
    if (ConnectionQueue.connectedEvent == undefined) {
      ConnectionQueue.connectedEvent = new EventEmitter()
      
      device.log("First caller connecting")
      const connected = await device._connect()
      if (connected) {
        ConnectionQueue.connectedEvent.emit("connected", true)
      } else {
        ConnectionQueue.connectedEvent.emit("connected", false)
      }
      device.log("Done connecting!")
      return ConnectionQueue.isLastCallerConnected(connected, callerTime)
      
    } else {
      device.log("Already connecting, waiting for connection...")
      return new Promise((resolve) => {
        ConnectionQueue.connectedEvent?.on("connected", (connected: boolean) => {
          resolve(ConnectionQueue.isLastCallerConnected(connected, callerTime))
        })
      })
    }

  }

  static isLastCallerConnected(connected: boolean, callerTime: number) {
    ConnectionQueue.callersWaiting--
    // Resets
    if (ConnectionQueue.callersWaiting == 0) {
      ConnectionQueue.connectedEvent = undefined
      ConnectionQueue.lastCallerTime = undefined
    }
    return connected && ConnectionQueue.lastCallerTime == callerTime
  }

}

class GenericDevice extends Homey.Device {

  #peripheralUUID: string = this.getData().uuid
  #connecting: boolean = false
  #disconnectTimerID: NodeJS.Timeout | undefined
  #commandCharacteristic: BleCharacteristic | undefined
  #notificationCharacteristic: BleCharacteristic | undefined

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
  async onAdded() {
    this.log(`${this.constructor.name} has been added`);
    const advertisement: BleAdvertisement = await this.homey.ble.find(this.#peripheralUUID, 5000)
    await this.setCapabilityValue(MotionCapability.RSSI, `${advertisement.rssi} dBm`)
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`${this.constructor.name} (${this.#peripheralUUID}) has been initialized`);
    await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.DISCONNECTED)
    await this.setCapabilityValue(MotionCapability.SPEED_PICKER, null)

    // Handle slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener(MotionCapability.POSITION_SLIDER, async (position) => {
      if (!await this.connect()) return
      
      position = Math.ceil(position * 100)
      const percentageCommand: Buffer = MotionCommand.percentage(position)
      await this.#commandCharacteristic?.write(percentageCommand)
      this.log(position)
    })

    // Handle button clicks, strings: up, idle, down
    this.registerCapabilityListener(MotionCapability.BUTTONS, async (state) => {
      if (!await this.connect()) return
    
      let stateCommand: Buffer = Buffer.from('')
      switch(state) {
        case "up": {
          stateCommand = MotionCommand.up()
          break
        }
        case "idle": {
          const currentIdleClickTime = Date.now()
          if (this.#lastIdleClickTime != undefined && currentIdleClickTime - this.#lastIdleClickTime < 500) {
            this.#lastIdleClickTime = 0
            stateCommand = MotionCommand.favorite()
          } else {
            this.#lastIdleClickTime = currentIdleClickTime
            stateCommand = MotionCommand.stop()
          }
          break
        }
        case "down": {
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
      if (!await this.connect()) return
      await this.#commandCharacteristic?.write(MotionCommand.favorite())
    })

    // Handle speed value changes
    this.registerCapabilityListener(MotionCapability.SPEED_PICKER, async (key: string) => {
      if (!await this.connect()) return
      const speed_level: MotionSpeedLevel = Number.parseInt(key)
      this.#commandCharacteristic?.write(MotionCommand.speed(speed_level))
    })

    // Handle tilt slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener(MotionCapability.TILT_SLIDER, async (angle: number) => {
      if (!await this.connect()) return
      angle = Math.round(180 * angle)
      this.log(angle)
      const tiltCommand: Buffer = MotionCommand.tilt(angle)
      await this.#commandCharacteristic?.write(tiltCommand)
    })

    const advertisement: BleAdvertisement = await this.homey.ble.find(this.#peripheralUUID, 5000)
    await this.setCapabilityValue(MotionCapability.RSSI, `${advertisement.rssi} dBm`)

  }

  setIsConnecting(connecting: boolean) {
    this.#connecting = connecting
  }

  isConnecting(): boolean {
    return this.#connecting
  }

  isConnected(): boolean {
    return this.#commandCharacteristic != undefined && this.#commandCharacteristic.service.peripheral.isConnected
  }

  async connect() {
    if (!this.isConnected())
      return await ConnectionQueue.waitForConnection(this)
    this.refreshDisconnectTimer(Settings.DISCONNECT_TIME)
    return true
  }

  async _connect(): Promise<boolean> {
    await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.CONNECTING)
    this.setIsConnecting(true)
    try {
      this.log(`Finding device ${this.#peripheralUUID}...`)
      const advertisement: BleAdvertisement = await this.homey.ble.find(this.#peripheralUUID, 5000)
      await this.setCapabilityValue(MotionCapability.RSSI, `${advertisement.rssi} dBm`)

      this.log('Connecting to device...')
      const peripheral: BlePeripheral = await advertisement.connect()
      await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.CONNECTED)

      this.log('Getting service...')
      // this.log(await peripheral.discoverAllServicesAndCharacteristics())
      const service: BleService = await peripheral.getService(MotionService.CONTROL)
      this.log('Getting characteristic...')
      this.#commandCharacteristic = await service.getCharacteristic(MotionCharacteristic.COMMAND)
      this.#notificationCharacteristic = await service.getCharacteristic(MotionCharacteristic.NOTIFICATION)
      this.log("Subscribing to notifications...")
      await this.#notificationCharacteristic?.subscribeToNotifications(((notification: Buffer) => this.notificationHandler(notification)).bind(this))
      this.log("Setting user key...")
      const userKeyCommand: Buffer = MotionCommand.setKey()
      await this.#commandCharacteristic.write(userKeyCommand)
      const statusQueryCommand: Buffer = MotionCommand.statusQuery()
      await this.#commandCharacteristic.write(statusQueryCommand)
      this.refreshDisconnectTimer(Settings.DISCONNECT_TIME)
      this.log("Ready to send command")
      this.setIsConnecting(false)
      return true

    } catch (e) {
      await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.DISCONNECTED)
      this.log(e)
      return false
    }
  }

  async notificationHandler(notificationBuffer: Buffer) {
    if (notificationBuffer.length % 16 == 0) {
      this.log("Received encrypted notification.")
      const decryptedNotificationString: string = MotionNotification._decode_decrypt(notificationBuffer)
      this.log(decryptedNotificationString)
      const decryptedNotificationBuffer: Buffer = MotionNotification._decrypt(notificationBuffer)
      if (decryptedNotificationString.startsWith(MotionNotificationType.PERCENT)) {
        const position: number = decryptedNotificationBuffer[6] / 100
        const angle = Math.round((decryptedNotificationBuffer[7] / 180) * 100) / 100

        this.log(`Percentage: ${position}`)
        this.log(`Angle: ${angle}`)
        await this.setCapabilityValue(MotionCapability.POSITION_SLIDER, position)
        await this.setCapabilityValue(MotionCapability.TILT_SLIDER, angle)
      } else if (decryptedNotificationString.startsWith(MotionNotificationType.FIRST_CHECK)) {
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
      }
    } else {
      this.error(`Unknown message ${notificationBuffer}`)
    }
  }

  refreshDisconnectTimer(time: number) {
    // Delete previous timer
    if (this.#disconnectTimerID)
      clearTimeout(this.#disconnectTimerID)
    
    this.#disconnectTimerID = setTimeout((async () => {
        await this.setCapabilityValue(MotionCapability.CONNECTED_SENSOR, MotionConnectionType.DISCONNECTED)
        await this.disconnect()
    }).bind(this), time * 1000)
  }

  async disconnect() {
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
    this.log("GenericDevice settings where changed");
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('GenericDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('GenericDevice has been deleted');
  }

}

export default GenericDevice;

import Homey, { BleAdvertisement, BlePeripheral, BleService, BleCharacteristic } from 'homey';

const { MotionService, MotionCharacteristic, MotionNotificationType, Settings } = require('../const')
const MotionCommand = require('../command')
const MotionNotification = require('../notification')
const MotionCrypt = require('../crypt')

class GenericDevice extends Homey.Device {

  #peripheralUUID: string = this.getData().uuid
  #isConnecting: boolean = false
  #lastIdleClickTime: number = 0
  #disconnectTimerID: NodeJS.Timeout | undefined
  commandCharacteristic: BleCharacteristic | undefined
  notificationCharacteristic: BleCharacteristic | undefined

  /**
  * onAdded is called when the user adds the device, called just after pairing.
  */
  async onAdded() {
    this.log('GenericDevice has been added');
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    // Handle slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener('windowcoverings_set', async (percent) => {
      if (this.isConnecting()) return
      await this.connectIfNotConnected()
      
      const p = Math.ceil(percent * 100)
      const percentageCommand: Buffer = MotionCommand.percentage(p)
      await this.commandCharacteristic?.write(percentageCommand)
      this.refreshDisconnectTimer(Settings.DISCONNECT_TIME)
      this.log(percent)
    })

    // Handle button clicks, strings: up, idle, down
    this.registerCapabilityListener('windowcoverings_state', async (state) => {
      if (this.isConnecting()) return
      await this.connectIfNotConnected()

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
      await this.commandCharacteristic?.write(stateCommand)
      this.refreshDisconnectTimer(Settings.DISCONNECT_TIME)

    })
  }

  setIsConnecting(connecting: boolean) {
    this.#isConnecting = connecting
  }

  isConnecting(): boolean {
    return this.#isConnecting
  }

  isConnected(): boolean {
    return this.commandCharacteristic != undefined && this.commandCharacteristic.service.peripheral.isConnected
  }

  async connectIfNotConnected() {
    if (!this.isConnected())
      await this.connect()
  }

  async connect() {
    this.setIsConnecting(true)
    this.log(`Finding device ${this.#peripheralUUID}...`)
    const advertisement: BleAdvertisement = await this.homey.ble.find(this.#peripheralUUID, 5000)
    this.log('Connecting to device...')
    const peripheral: BlePeripheral = await advertisement.connect()
    this.log('Getting service...')
    // this.log(await peripheral.discoverAllServicesAndCharacteristics())
    const service: BleService = await peripheral.getService(MotionService.CONTROL)
    this.log('Getting characteristic...')
    this.commandCharacteristic = await service.getCharacteristic(MotionCharacteristic.COMMAND)
    this.notificationCharacteristic = await service.getCharacteristic(MotionCharacteristic.NOTIFICATION)
    this.log("Subscribing to notifications...")
    await this.notificationCharacteristic?.subscribeToNotifications(((notification: Buffer) => this.notificationHandler(notification)).bind(this))
    this.log("Setting user key...")
    const userKeyCommand: Buffer = MotionCommand.setKey()
    await this.commandCharacteristic.write(userKeyCommand)
    const statusQueryCommand: Buffer = MotionCommand.statusQuery()
    await this.commandCharacteristic.write(statusQueryCommand)
    this.refreshDisconnectTimer(Settings.DISCONNECT_TIME)
    this.log("Ready to send command")
    this.setIsConnecting(false)
  }

  async notificationHandler(notificationBuffer: Buffer) {
    if (notificationBuffer.length % 16 == 0) {
      this.log("Received encrypted notification.")
      const decryptedNotificationString: string = MotionNotification._decode_decrypt(notificationBuffer)
      this.log(decryptedNotificationString)
      const decryptedNotificationBuffer: Buffer = MotionNotification._decrypt(notificationBuffer)
      if (decryptedNotificationString.startsWith(MotionNotificationType.PERCENT)) {
        const position_percentage: number = decryptedNotificationBuffer[6]
        const position: number = position_percentage / 100
        const angle_percentage: number = decryptedNotificationBuffer[7]
        const angle = Math.round((angle_percentage / 180) * 100) / 100
        this.log(`Percentage: ${position_percentage}`)
        this.log(`Angle: ${angle_percentage}`)
        await this.setCapabilityValue('windowcoverings_set', position)
        if (this.hasCapability('windowcoverings_tilt_set'))
            await this.setCapabilityValue('windowcoverings_tilt_set', angle)
      } else if (decryptedNotificationString.startsWith(MotionNotificationType.FIRST_CHECK)) {
        const batteryPercentage: number = decryptedNotificationBuffer[17]
        this.log(`Battery percentage: ${batteryPercentage}`)
        await this.setCapabilityValue('battery', `${batteryPercentage}%`)
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
      await this.disconnect()
    }).bind(this), time * 1000)
  }

  async disconnect() {
    await this.commandCharacteristic?.service.peripheral.disconnect()
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

module.exports = GenericDevice;

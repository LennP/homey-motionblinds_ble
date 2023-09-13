import Homey, { BleAdvertisement, BlePeripheral, BleService, BleCharacteristic } from 'homey';

import { MotionConnectionType, MotionService, MotionCharacteristic, MotionNotificationType, Settings } from '../const'
import MotionCommand from '../command'
import MotionNotification from '../notification'

class GenericDevice extends Homey.Device {

  peripheralUUID: string = this.getData().uuid
  connecting: boolean = false
  disconnectTimerID: NodeJS.Timeout | undefined
  commandCharacteristic: BleCharacteristic | undefined
  notificationCharacteristic: BleCharacteristic | undefined

  /**
  * onAdded is called when the user adds the device, called just after pairing.
  */
  async onAdded() {
    this.log(`${this.constructor.name} has been added`);
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`${this.constructor.name} (${this.peripheralUUID}) has been initialized`);
    await this.setCapabilityValue('connected', MotionConnectionType.DISCONNECTED)
  }

  setIsConnecting(connecting: boolean) {
    this.connecting = connecting
  }

  isConnecting(): boolean {
    return this.connecting
  }

  isConnected(): boolean {
    return this.commandCharacteristic != undefined && this.commandCharacteristic.service.peripheral.isConnected
  }

  async connectIfNotConnected() {
    if (!this.isConnected())
      await this.connect()
  }

  async connect() {
    await this.setCapabilityValue("connected", MotionConnectionType.CONNECTING)
    this.setIsConnecting(true)
    try {
      this.log(`Finding device ${this.peripheralUUID}...`)
      const advertisement: BleAdvertisement = await this.homey.ble.find(this.peripheralUUID, 5000)

      this.log('Connecting to device...')
      const peripheral: BlePeripheral = await advertisement.connect()
      await this.setCapabilityValue('connected', MotionConnectionType.CONNECTED)

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
    } catch (e) {
      this.log(e)
      await this.setCapabilityValue('connected', MotionConnectionType.DISCONNECTED)
    }
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
    if (this.disconnectTimerID)
      clearTimeout(this.disconnectTimerID)
    
    this.disconnectTimerID = setTimeout((async () => {
        await this.setCapabilityValue("connected", MotionConnectionType.DISCONNECTED)
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

export default GenericDevice;

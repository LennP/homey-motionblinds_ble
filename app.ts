import Homey from 'homey';

const MotionCrypt = require('./lib/crypt')
const MotionTime = require('./lib/time')

class MotionBlindBLE extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('MotionBlinds BLE has been initialized');

    // Adjusts the time for the time zone
    const currentTimeZone = this.homey.clock.getTimezone()
    MotionTime.setCurrentTimeZone(currentTimeZone)

    // Sets the encryption key
    MotionCrypt.setEncryptionKey(Homey.env.ENCRYPTION_KEY)
    this.log(MotionCrypt.decrypt("244e1d963ebdc5453f43e896465b5bcf"))

  }

}

module.exports = MotionBlindBLE;

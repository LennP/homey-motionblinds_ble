import Homey from 'homey'

import MotionCrypt from './lib/crypt'

class MotionBlindsBLE extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log(`${this.constructor.name} has been initialized`)

    // Adjusts the time for the time zone
    const timezone = this.homey.clock.getTimezone()
    MotionCrypt.setTimezone(timezone)

    // Sets the encryption key
    MotionCrypt.setEncryptionKey(Homey.env.ENCRYPTION_KEY)
    this.log(MotionCrypt.decrypt('244e1d963ebdc5453f43e896465b5bcf'))
  }
}

module.exports = MotionBlindsBLE

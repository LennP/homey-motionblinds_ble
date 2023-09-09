const GenericDevice = require('../../lib/components/genericDevice')

class RollerBlindDevice extends GenericDevice {

  /**
  * onAdded is called when the user adds the device, called just after pairing.
  */
  async onAdded() {
    this.log('RollerBlindDevice has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('RollerBlindDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('RollerBlindDevice has been deleted');
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('RollerBlindDevice has been initialized');
    super.onInit()
  }

}

module.exports = RollerBlindDevice;

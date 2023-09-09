const GenericDriver = require('../../lib/components/genericDriver')

class RollerBlindDriver extends GenericDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('RollerBlindDriver has been initialized');
  }

}

module.exports = RollerBlindDriver;

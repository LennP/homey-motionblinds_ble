const GenericDriver = require('../../lib/components/genericDriver')

class CurtainBlindDriver extends GenericDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('CurtainBlindDriver has been initialized');
  }

}

module.exports = CurtainBlindDriver;

import Homey from 'homey';
const GenericDriver = require('../../lib/components/genericDriver')

class VenetianBlindDriver extends GenericDriver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('VenetianBlindDriver has been initialized');
  }

}

module.exports = VenetianBlindDriver;

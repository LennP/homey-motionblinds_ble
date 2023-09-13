import GenericPositionDevice from './genericPositionDevice'
import MotionCommand from '../command'

class GenericTiltDevice extends GenericPositionDevice {
    
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    // Handle slider value changes, value from 0.00 to 1.00
    this.registerCapabilityListener('windowcoverings_tilt_set', async (percent: number) => {
      const angle = Math.round(180 * percent)
      this.log(angle)
      if (this.isConnecting()) return
      this.log('a')
      await this.connectIfNotConnected()
      this.log('b')
      
      
      const tiltCommand: Buffer = MotionCommand.tilt(angle)
      this.log('c')
      await this.commandCharacteristic?.write(tiltCommand)
      this.log('d')
      this.refreshDisconnectTimer(10000)
      this.log('e')
    })

    super.onInit()
  }
    
}

export default GenericTiltDevice;
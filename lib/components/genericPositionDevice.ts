import { Settings } from '../const'
import MotionCommand from '../command'
import MotionCrypt from '../crypt'
import GenericDevice from './genericDevice';

class GenericPositionDevice extends GenericDevice {

  #lastIdleClickTime: number = 0

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {

    super.onInit()

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

}

export default GenericPositionDevice;

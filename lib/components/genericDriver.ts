import Homey, { BleAdvertisement } from 'homey'
import { PairSession } from 'homey/lib/Driver'
import { Settings } from '../const'

class GenericDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log(`${this.constructor.name} has been initialized`)
  }

  /**
   * Used to test whether or not some string of characters is a Motion MAC code.
   * @param s the MAC code string
   * @returns whether or not the string is a MAC code
   */
  isMACCode(s: string): boolean {
    const codeRegex = /^[0-9A-Fa-f]{4}$/
    return codeRegex.test(s)
  }

  /**
   * onPair is called when a pair session is started.
   * @param session the pair session
   */
  onPair(session: PairSession) {
    this.log('Pair session started')

    let targetMAC: string = ''
    let targetAdvertisements: Array<BleAdvertisement> = []

    session.setHandler('pincode', async (macChars: Array<string>) => {
      const mac = macChars.join('')
      targetMAC = mac.toUpperCase()
      return this.isMACCode(mac)
    })

    session.setHandler('showView', async (view: string) => {
      if (view === 'loading') {
        this.log(`Discovering devices with MAC ${targetMAC}...`)
        const startDiscovery = Date.now()
        const advertisements: Array<BleAdvertisement> =
          await this.homey.ble.discover([], Settings.DISCOVER_TIME * 1000)
        const endDiscovery = Date.now()
        const discoveryTime = endDiscovery - startDiscovery
        this.log(
          `Finished discovering, found ${advertisements.length} advertisements (${discoveryTime}ms)`,
        )
        const motionBlindsAdvertisements: Array<BleAdvertisement> =
          advertisements.filter(
            ad => ad.localName != undefined && ad.localName.includes('MOTION'),
          )
        targetAdvertisements = motionBlindsAdvertisements.filter(ad =>
          ad.localName.includes(targetMAC),
        )
        this.log(motionBlindsAdvertisements)
        await session.nextView()
      }
    })

    session.setHandler('list_devices', async () => {
      return targetAdvertisements.map(ad => {
        return {
          name: `MotionBlind ${targetMAC}`,
          data: {
            mac: ad.address,
            uuid: ad.uuid,
          },
        }
      })
    })
  }
}

export default GenericDriver

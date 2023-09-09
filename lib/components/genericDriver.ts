import Homey, { BleAdvertisement } from 'homey';
import { PairSession } from 'homey/lib/Driver';

const { Settings } = require('../const')

class GenericDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log(`GenericDriver has been initialized`);
  }

  isMac(s: string): boolean {
    let codeRegex = /^[0-9A-Fa-f]{4}$/;
    return codeRegex.test(s);
  }


  onPair(session: PairSession) {
    this.log('Pair session started')

    var targetMAC: string = ""
    var targetAdvertisements: Array<BleAdvertisement> = []

    session.setHandler("pincode", async (macChars: Array<string>) => {

      const mac = macChars.join('');
      targetMAC = mac.toUpperCase();

      return this.isMac(mac);
    });

    session.setHandler('showView', async (view: any) => {
      if (view === 'loading') {
        this.log(`Discovering devices with MAC ${targetMAC}...`)
        const startDiscovery = Date.now()
        const advertisements: Array<BleAdvertisement> = await this.homey.ble.discover([], (Settings.DISCOVER_TIME * 1000));
        const endDiscovery = Date.now()
        const discoveryTime = endDiscovery - startDiscovery
        this.log(`Finished discovering, found ${advertisements.length} advertisements (${discoveryTime}ms)`)
        const motionBlindsAdvertisements: Array<BleAdvertisement> = advertisements.filter(ad => ad.localName != undefined && ad.localName.includes("MOTION"))
        targetAdvertisements = motionBlindsAdvertisements.filter(ad => ad.localName.includes(targetMAC))
        this.log(motionBlindsAdvertisements)
        await session.nextView();
      }
    });

    session.setHandler("list_devices", async () => {
      return targetAdvertisements.map(ad => {
        return {
          name: `MotionBlind ${targetMAC}`,
          data: {
            mac: ad.address,
            uuid: ad.uuid
          }
        }
      });

    });

  }

}

module.exports = GenericDriver;

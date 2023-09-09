
const { DateTime } = require('luxon');

class MotionTime {

    static currentTimeZone: string | undefined

    static setCurrentTimeZone(timeZoneString: string) {
        MotionTime.currentTimeZone = timeZoneString;
    }

    static _formatHexNum(i: number, z: boolean = false): string {
        let hexString = i.toString(16);
        let length = hexString.length;
    
        if (length === 1) {
            if (z) {
                return "000" + hexString;
            }
            return '0' + hexString;
        } else if (length === 2) {
            if (z) {
                return "00" + hexString;
            }
            return hexString;
        } else if (length === 3) {
            return '0' + hexString;
        } else {
            return hexString;
        }
    }

    static _formatHexNumDefault(i: number, z: boolean = false, i2: number = 0, obj = null): string {
        if ((i2 & 2) !== 0) {
            z = false;
        }
        return MotionTime._formatHexNum(i, z);
    }

    static getTime(): string {
        // let now = new Date();
        let now = DateTime.now().setZone(MotionTime.currentTimeZone);
    
        let year = now.year % 100;
        let month = now.month; // Luxon months start from 1
        let day = now.day;
        let hour = now.hour;
        let minute = now.minute;
        let second = now.second;
        let microsecond = now.millisecond;
    
        let yearHex = MotionTime._formatHexNumDefault(year);
        let monthHex = MotionTime._formatHexNumDefault(month);
        let dayHex = MotionTime._formatHexNumDefault(day);
        let hourHex = MotionTime._formatHexNumDefault(hour);
        let minuteHex = MotionTime._formatHexNumDefault(minute);
        let secondHex = MotionTime._formatHexNumDefault(second);
        let microsecondHex = MotionTime._formatHexNum(microsecond, true);
    
        return yearHex + monthHex + dayHex + hourHex + minuteHex + secondHex + microsecondHex;
    }

}

module.exports = MotionTime;





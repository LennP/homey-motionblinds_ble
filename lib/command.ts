
const { MotionCommandType } = require('./const')
const MotionCrypt = require('./crypt')
const MotionTime = require('./time')

class MotionCommand {

    static up(): Buffer {
        const command: string = MotionCommandType.OPEN + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);
    }

    static down(): Buffer {
        const command: string = MotionCommandType.CLOSE + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);
    }

    static stop(): Buffer {
        const command: string = MotionCommandType.STOP + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);
    }

    static favorite(): Buffer {
        const command: string = MotionCommandType.FAVORITE + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);
    }

    static percentage(percent: number): Buffer {
        if (percent < 0 || percent > 100)
            throw new Error("Percentage should be between 0 and 100")
        
        const percent_hex: string = percent.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.PERCENT + percent_hex + "00" + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);;
    }

    static tilt(angle: number): Buffer {
        if (angle < 0 || angle > 180)
            throw new Error("Angle should be between 0 and 180")
        
        const angle_hex: string = angle.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.ANGLE + "00" + angle_hex + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);;
    }

    static setKey(): Buffer {
        const command: string = MotionCommandType.SET_KEY + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);
    }

    static statusQuery(): Buffer {
        const command: string = MotionCommandType.STATUS_QUERY + MotionTime.getTime()
        return MotionCommand._encode_encrypt(command);
    }

    static _encode_encrypt(command: string): Buffer {
        return Buffer.from(MotionCrypt.encrypt(command), "hex")
    }


}

module.exports = MotionCommand;
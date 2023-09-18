import { MotionSpeedLevel, MotionCommandType } from './const'
import MotionCrypt from './crypt'

class MotionCommand {

    static up(): Buffer {
        const command: string = MotionCommandType.OPEN + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static down(): Buffer {
        const command: string = MotionCommandType.CLOSE + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static stop(): Buffer {
        const command: string = MotionCommandType.STOP + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static favorite(): Buffer {
        const command: string = MotionCommandType.FAVORITE + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static percentage(percent: number): Buffer {
        if (percent < 0 || percent > 100)
            throw new Error("Percentage should be between 0 and 100")
        
        const percent_hex: string = percent.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.PERCENT + percent_hex + "00" + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);;
    }

    static tilt(angle: number): Buffer {
        if (angle < 0 || angle > 180)
            throw new Error("Angle should be between 0 and 180")
        
        const angle_hex: string = angle.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.ANGLE + "00" + angle_hex + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);;
    }

    static setKey(): Buffer {
        const command: string = MotionCommandType.SET_KEY + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static speed(speed: MotionSpeedLevel): Buffer {
        const speed_hex: string = speed.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.SPEED + speed_hex + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static statusQuery(): Buffer {
        const command: string = MotionCommandType.STATUS_QUERY + MotionCrypt.getTime()
        return MotionCommand._encodeEncrypt(command);
    }

    static _encodeEncrypt(command: string): Buffer {
        return Buffer.from(MotionCrypt.encrypt(command), "hex")
    }


}

export default MotionCommand
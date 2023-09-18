import { MotionSpeedLevel, MotionCommandType } from './const'
import MotionCrypt from './crypt'

class MotionCommand {

    /**
     * Used to create a move up command.
     * @returns {Buffer} a buffer containing the bytes
     */
    static up(): Buffer {
        const command: string = MotionCommandType.OPEN + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to create a move down command.
     * @returns {Buffer} a buffer containing the bytes
     */
    static down(): Buffer {
        const command: string = MotionCommandType.CLOSE + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to create a stop moving command.
     * @returns {Buffer} a buffer containing the bytes
     */
    static stop(): Buffer {
        const command: string = MotionCommandType.STOP + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to create a move to favorite position command.
     * @returns {Buffer} a buffer containing the bytes
     */
    static favorite(): Buffer {
        const command: string = MotionCommandType.FAVORITE + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to create a move to percentage command.
     * @param {number} percent the percentage to move to
     * @returns {Buffer} a buffer containing the bytes
     */
    static percentage(percent: number): Buffer {
        if (percent < 0 || percent > 100)
            throw new Error("Percentage should be between 0 and 100")
        
        const percent_hex: string = percent.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.PERCENT + percent_hex + "00" + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);;
    }

    /**
     * Used to create a tilt to angle command.
     * @param {number} angle the angle to tilt to
     * @returns {Buffer} a buffer containing the bytes
     */
    static tilt(angle: number): Buffer {
        if (angle < 0 || angle > 180)
            throw new Error("Angle should be between 0 and 180")
        
        const angle_hex: string = angle.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.ANGLE + "00" + angle_hex + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);;
    }

    /**
     * Used to create a command that sets the key.
     * @returns {Buffer} a buffer containing the bytes
     */
    static setKey(): Buffer {
        const command: string = MotionCommandType.SET_KEY + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to create a command that changes the speed of the motor.
     * @returns {Buffer} a buffer containing the bytes
     */
    static speed(speed: MotionSpeedLevel): Buffer {
        const speed_hex: string = speed.toString(16).padStart(2, '0')
        const command: string = MotionCommandType.SPEED + speed_hex + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to create a command that queries the motor for information.
     * @returns {Buffer} a buffer containing the bytes
     */
    static statusQuery(): Buffer {
        const command: string = MotionCommandType.STATUS_QUERY + MotionCrypt.getTime()
        return MotionCommand.encryptEncode(command);
    }

    /**
     * Used to encrypt a message and then encode it as bytes from a hexadecimal string.
     * @param {string} command a hexadecimal string containing the command to encrypt and encode
     * @returns {Buffer} a buffer containing the bytes
     */
    static encryptEncode(command: string): Buffer {
        return Buffer.from(MotionCrypt.encrypt(command), "hex")
    }


}

export default MotionCommand
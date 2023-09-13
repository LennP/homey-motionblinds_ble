import MotionCrypt from './crypt'

class MotionNotification {

    // static up(): Buffer {
    //     const command: string = MotionCommandType.OPEN + MotionTime.getTime()
    //     return MotionNotification._encode_encrypt(command);
    // }

    // static down(): Buffer {
    //     const command: string = MotionCommandType.CLOSE + MotionTime.getTime()
    //     return MotionNotification._encode_encrypt(command);
    // }

    // static stop(): Buffer {
    //     const command: string = MotionCommandType.STOP + MotionTime.getTime()
    //     return MotionNotification._encode_encrypt(command);
    // }

    // static favorite(): Buffer {
    //     const command: string = MotionCommandType.FAVORITE + MotionTime.getTime()
    //     return MotionNotification._encode_encrypt(command);
    // }

    // static percentage(percent: number): Buffer {
    //     const p = Math.ceil(percent * 100)
    //     if (p < 0 || p > 100)
    //         throw new Error("Percentage should be between 0 and 100")
        
    //     const percent_hex: string = p.toString(16).padStart(2, '0')
    //     const command: string = MotionCommandType.PERCENT + percent_hex + "00" + MotionTime.getTime()
    //     return MotionNotification._encode_encrypt(command);;
    // }

    // static setKey(): Buffer {
    //     const command: string = MotionCommandType.SET_KEY + MotionTime.getTime()
    //     return MotionNotification._encode_encrypt(command);
    // }

    static _decode_decrypt(command: Buffer): string {
        return MotionCrypt.decrypt(command.toString('hex'))
    }

    static _decrypt(command: Buffer): Buffer {
        return Buffer.from(MotionCrypt.decrypt(command.toString('hex')), "hex")
    }


}

export default MotionNotification;
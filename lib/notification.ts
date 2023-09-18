import MotionCrypt from './crypt'

class MotionNotification {

    static _decode_decrypt(command: Buffer): string {
        return MotionCrypt.decrypt(command.toString('hex'))
    }

    static _decrypt(command: Buffer): Buffer {
        return Buffer.from(MotionCrypt.decrypt(command.toString('hex')), "hex")
    }


}

export default MotionNotification;
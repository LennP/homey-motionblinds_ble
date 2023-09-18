import MotionCrypt from './crypt'

class MotionNotification {

    /**
     * Used to decrypt a message and then encode it as a hexadecimal string.
     * @param {Buffer} notification a buffer containing the command to decrypt and encode
     * @returns {string} a hexadecimal string containing the decrypted message
     */
    static decryptDecode(notification: Buffer): string {
        return MotionCrypt.decrypt(notification.toString('hex'))
    }

    /**
     * Used to decrypt a message.
     * @param {Buffer} command a buffer containing the command to decrypt
     * @returns {Buffer} a buffer containing the decrypted message bytes
     */
    static decrypt(command: Buffer): Buffer {
        return Buffer.from(MotionCrypt.decrypt(command.toString('hex')), "hex")
    }

}

export default MotionNotification;
const CryptoJS = require("crypto-js");

class MotionCrypt {

    static encryptionKey: string | undefined = undefined

    /**
     * Sets the Motion encryption key
     * @param key the encryption key to use in UTF-8 format
     */
    static setEncryptionKey(key: string): void {
        MotionCrypt.encryptionKey = CryptoJS.enc.Utf8.parse(key);
    }

    /**
     * Encrypts some text with the encryption key
     * @param text the text in hex string format
     * @returns the encrypted text in hex string format
     */
    static encrypt(text: string): string {
        const textBytes = CryptoJS.enc.Hex.parse(text);
        const cipher = CryptoJS.AES.encrypt(textBytes, MotionCrypt.encryptionKey, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        });
        return cipher.ciphertext.toString(CryptoJS.enc.Hex);
    }

    /**
     * Decrypts some text with the encryption key
     * @param cipheredText the encrypted text in hex string format
     * @returns the decrypted text in hex string format
     */
    static decrypt(cipheredText: string): string {
        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Hex.parse(cipheredText)
        });
        const decrypted = CryptoJS.AES.decrypt(cipherParams, MotionCrypt.encryptionKey, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        });
        return decrypted.toString(CryptoJS.enc.Hex);
    }

}

export default MotionCrypt


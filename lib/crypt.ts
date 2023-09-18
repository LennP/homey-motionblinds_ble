const CryptoJS = require("crypto-js");
const { DateTime } = require('luxon');

class MotionCrypt {

    static timeZone: string | undefined
    static encryptionKey: string | undefined = undefined

    /**
     * Sets the timezone.
     * @param key the encryption key to use in UTF-8 format
     */
    static setTimezone(timeZone: string): void {
        MotionCrypt.timeZone = timeZone;
    }

    /**
     * Formats a number like a hexadecimal string a with certain number of characters.
     * @param number the number to convert to hexadecimal
     * @param numberOfChars the number of hexadecimal characters
     * @returns the hexadecimal string
     */
    static _formatHex(number: number, numberOfChars = 2): string {
        const mask = (1 << (numberOfChars * 4)) - 1;
        const formattedNumber = (number & mask).toString(16);
        return formattedNumber.padStart(numberOfChars, '0');
    }

    /**
     * Gets the Motion time string needed for commands.
     * @returns the Motion time string
     */
    static getTime(): string {
        if (!MotionCrypt.timeZone)
            throw new TimezoneNotSetException("Motion encryption requires a valid timezone.")
        let now = DateTime.now().setZone(MotionCrypt.timeZone);
    
        let year = now.year % 100;
        let month = now.month; // Luxon months start from 1
        let day = now.day;
        let hour = now.hour;
        let minute = now.minute;
        let second = now.second;
        let microsecond = now.millisecond;
    
        let yearHex = MotionCrypt._formatHex(year);
        let monthHex = MotionCrypt._formatHex(month);
        let dayHex = MotionCrypt._formatHex(day);
        let hourHex = MotionCrypt._formatHex(hour);
        let minuteHex = MotionCrypt._formatHex(minute);
        let secondHex = MotionCrypt._formatHex(second);
        let microsecondHex = MotionCrypt._formatHex(microsecond, 4);
    
        return yearHex + monthHex + dayHex + hourHex + minuteHex + secondHex + microsecondHex;
    }

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

class TimezoneNotSetException extends Error {
    constructor(message: string) {
        super(message)
    }
}

export default MotionCrypt


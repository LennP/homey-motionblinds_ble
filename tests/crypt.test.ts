
const MotionCrypt = require('../lib/crypt')

test('Encryption and decryption 128 bits', () => {

    const key = 'a3q8r8c135sqbn66'
    MotionCrypt.setEncryptionKey(key)
    
    const initial = "244e1d963ebdc5453f43e896465b5bcf";
    const decrypted = MotionCrypt.decrypt(initial);
    console.log(decrypted)
    const encrypted = MotionCrypt.encrypt(decrypted);
    expect(decrypted).toBe("070404020e0059b4")
    expect(encrypted).toBe(initial)

})

test('Encryption and decryption 256 bits', () => {

    const key = 'a3q8r8c135sqbn66'
    MotionCrypt.setEncryptionKey(key)

    const initial = "69bfafefae90f4d98e226064bd99fc9d8776fe675d70a8cd7adce3c5210b3681";
    const decrypted = MotionCrypt.decrypt(initial);
    const encrypted = MotionCrypt.encrypt(decrypted);
    expect(decrypted).toBe("12040f020e0048b40018071002000000001c0b");
    expect(encrypted).toBe(initial);

})

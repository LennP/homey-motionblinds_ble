// Settings for application
enum Setting {
    
    DISCOVER_TIME = 20,          // Time in seconds used to discover devices
    DISCOVER_ITERATIONS = 1,    // 
    DISCONNECT_TIME = 15        // Time in seconds before the device is disconnected

}

enum MotionCapability {
    POSITION_SLIDER =   "windowcoverings_set",
    TILT_SLIDER =       "windowcoverings_tilt_set",
    BUTTONS =           "windowcoverings_state",
    BATTERY_SENSOR =    "battery",
    CONNECTED_SENSOR =  "connected",
    SPEED_PICKER =      "speed",
    RSSI =              "rssi"
}

enum MotionSpeedLevel {
    LOW =       1,
    MEDIUM =    2,
    HIGH =      3
}

enum MotionConnectionType {
    CONNECTED = "connected",
    CONNECTING = "connecting",
    DISCONNECTED = "disconnected",
    DISCONNECTING = "disconnecting"
}

enum MotionBlindType {
    ROLLER =                "roller",
    HONEYCOMB =             "honeycomb",
    ROMAN =                 "roman",
    VENETIAN =              "venetian",
    VENETIAN_TILT_ONLY =    "venetian_tilt_only",
    DOUBLE_ROLLER =         "double_roller",
    CURTAIN =               "curtain",
    VERTICAL =              "vertical"
}

enum MotionService {
    CONTROL =       "d973f2e0b19e11e29e960800200c9a66"
}

enum MotionCharacteristic {
    COMMAND =       "d973f2e2b19e11e29e960800200c9a66",
    NOTIFICATION =  "d973f2e1b19e11e29e960800200c9a66"
}

enum MotionCommandType {
    OPEN =          "03020301",
    CLOSE =         "03020302",
    STOP =          "03020303",
    FAVORITE =      "03020306",
    PERCENT =       "05020440",
    ANGLE =         "05020420",
    SET_KEY =       "02c001",
    SPEED =         "0403010a",
    STATUS_QUERY =  "03050f02"
}

enum MotionNotificationType {
    PERCENT =       "07040402",
    FIRST_CHECK =   "12040f02"
}

export {MotionCapability, MotionSpeedLevel, MotionConnectionType, MotionBlindType, MotionService, MotionCharacteristic, MotionCommandType, MotionNotificationType, Setting as Settings}
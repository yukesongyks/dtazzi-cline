package com.dtaz.poster.enums;

/**
 * 圈选类型枚举
 */
public enum SelectionType {
    /**
     * 全局圈选
     */
    GLOBAL("GLOBAL", "全局圈选"),
    
    /**
     * 设备黑名单
     */
    BLACK_LIST("BLACK_LIST", "设备黑名单"),
    
    /**
     * 设备白名单
     */
    WHITE_LIST("WHITE_LIST", "设备白名单");
    
    private final String code;
    private final String desc;
    
    SelectionType(String code, String desc) {
        this.code = code;
        this.desc = desc;
    }
    
    public String getCode() {
        return code;
    }
    
    public String getDesc() {
        return desc;
    }
}
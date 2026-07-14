package com.dtaz.poster.enums;

/**
 * 黑白名单类型枚举
 */
public enum ListType {
    /**
     * 黑名单
     */
    BLACK("BLACK", "黑名单"),
    
    /**
     * 白名单
     */
    WHITE("WHITE", "白名单");
    
    private final String code;
    private final String desc;
    
    ListType(String code, String desc) {
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
package com.dtaz.poster.enums;

/**
 * 圈选维度类型枚举
 */
public enum DimensionType {
    /**
     * 图灵人群ID
     */
    BIZ_TID("BIZ_TID", "图灵人群ID"),
    
    /**
     * 数字化门店ID
     */
    STORE_ID("STORE_ID", "数字化门店ID");
    
    private final String code;
    private final String desc;
    
    DimensionType(String code, String desc) {
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
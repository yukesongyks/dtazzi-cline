package com.dtaz.poster.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 活动信息关联实体
 */
@Data
public class ActivityRelation {
    /**
     * 主键
     */
    private Long id;
    
    /**
     * 投放计划ID
     */
    private Long planId;
    
    /**
     * 活动ID
     */
    private String activityId;
    
    /**
     * 活动名称
     */
    private String activityName;
    
    /**
     * 活动类型
     */
    private String activityType;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}
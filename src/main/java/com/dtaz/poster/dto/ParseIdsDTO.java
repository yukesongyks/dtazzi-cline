package com.dtaz.poster.dto;

import lombok.Data;
import java.util.List;

/**
 * 批量解析ID请求
 */
@Data
public class ParseIdsRequest {
    /**
     * ID输入字符串（逗号分隔）
     */
    private String idsInput;
}

/**
 * 批量解析ID响应
 */
@Data
class ParseIdsResponse {
    /**
     * 解析后的ID列表
     */
    private List<String> ids;
    
    /**
     * ID数量
     */
    private Integer count;
}
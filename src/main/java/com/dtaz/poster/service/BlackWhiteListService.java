package com.dtaz.poster.service;

import com.dtaz.poster.dto.CreateBlackWhiteListRequest;
import java.util.List;

/**
 * 黑白名单服务接口
 */
public interface BlackWhiteListService {
    
    /**
     * 创建黑白名单
     */
    Long createList(CreateBlackWhiteListRequest request);
    
    /**
     * 更新黑白名单
     */
    void updateList(Long listId, CreateBlackWhiteListRequest request);
    
    /**
     * 查询黑白名单详情
     */
    BlackWhiteListDetail queryListDetail(Long planId, String listType);
    
    /**
     * 删除黑白名单
     */
    void deleteList(Long listId);
}

/**
 * 黑白名单详情
 */
class BlackWhiteListDetail {
    private Long listId;
    private Long planId;
    private String listType;
    private List<ListItem> items;
    
    // getter/setter
    public Long getListId() { return listId; }
    public void setListId(Long listId) { this.listId = listId; }
    public Long getPlanId() { return planId; }
    public void setPlanId(Long planId) { this.planId = planId; }
    public String getListType() { return listType; }
    public void setListType(String listType) { this.listType = listType; }
    public List<ListItem> getItems() { return items; }
    public void setItems(List<ListItem> items) { this.items = items; }
    
    static class ListItem {
        private String dimensionType;
        private List<String> dimensionValues;
        
        public String getDimensionType() { return dimensionType; }
        public void setDimensionType(String dimensionType) { this.dimensionType = dimensionType; }
        public List<String> getDimensionValues() { return dimensionValues; }
        public void setDimensionValues(List<String> dimensionValues) { this.dimensionValues = dimensionValues; }
    }
}
package com.example.sort;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link BubbleSorter} 单元测试。
 *
 * <p>覆盖常规乱序、已升序、完全逆序、含重复、空数组、单元素、null 数组及稳定性等场景。
 */
class BubbleSorterTest {

    @Test
    @DisplayName("常规乱序数组应升序排序")
    void sortUnsortedArray() {
        Integer[] arr = {3, 1, 2};
        BubbleSorter.sort(arr);
        assertArrayEquals(new Integer[]{1, 2, 3}, arr);
    }

    @Test
    @DisplayName("已升序数组保持不变且提前终止")
    void sortAlreadySortedArray() {
        Integer[] arr = {1, 2, 3};
        BubbleSorter.sort(arr);
        assertArrayEquals(new Integer[]{1, 2, 3}, arr);
    }

    @Test
    @DisplayName("完全逆序数组应升序排序")
    void sortReversedArray() {
        Integer[] arr = {5, 4, 3, 2, 1};
        BubbleSorter.sort(arr);
        assertArrayEquals(new Integer[]{1, 2, 3, 4, 5}, arr);
    }

    @Test
    @DisplayName("含重复元素应正确排序")
    void sortArrayWithDuplicates() {
        Integer[] arr = {3, 1, 2, 1};
        BubbleSorter.sort(arr);
        assertArrayEquals(new Integer[]{1, 1, 2, 3}, arr);
    }

    @Test
    @DisplayName("空数组不报错")
    void sortEmptyArray() {
        Integer[] arr = {};
        BubbleSorter.sort(arr);
        assertArrayEquals(new Integer[]{}, arr);
    }

    @Test
    @DisplayName("单元素数组不报错")
    void sortSingleElementArray() {
        Integer[] arr = {1};
        BubbleSorter.sort(arr);
        assertArrayEquals(new Integer[]{1}, arr);
    }

    @Test
    @DisplayName("null 数组应抛出 NullPointerException")
    void sortNullArrayThrowsNpe() {
        Integer[] arr = null;
        assertThrows(NullPointerException.class, () -> BubbleSorter.sort(arr));
    }

    @Test
    @DisplayName("含 null 元素的数组应抛出 NullPointerException")
    void sortArrayWithNullElementThrowsNpe() {
        Integer[] arr = {1, null, 2};
        assertThrows(NullPointerException.class, () -> BubbleSorter.sort(arr));
    }

    @Test
    @DisplayName("相等元素的相对顺序保持不变（稳定性）")
    void sortStableForEqualElements() {
        // 仅按 value 比较，seq 标记原始相对顺序以验证稳定性
        class Item implements Comparable<Item> {
            final int value;
            final int seq;

            Item(int value, int seq) {
                this.value = value;
                this.seq = seq;
            }

            @Override
            public int compareTo(Item o) {
                return Integer.compare(this.value, o.value);
            }
        }

        Item[] arr = {
            new Item(2, 1),
            new Item(1, 1),
            new Item(2, 2),
            new Item(1, 2)
        };
        BubbleSorter.sort(arr);

        // 按 value 升序，且相同 value 的 seq 保持原始相对顺序（稳定性）
        assertEquals(1, arr[0].value);
        assertEquals(1, arr[0].seq);
        assertEquals(1, arr[1].value);
        assertEquals(2, arr[1].seq);
        assertEquals(2, arr[2].value);
        assertEquals(1, arr[2].seq);
        assertEquals(2, arr[3].value);
        assertEquals(2, arr[3].seq);
    }
}

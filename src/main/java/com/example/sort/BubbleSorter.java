package com.example.sort;

/**
 * 冒泡排序工具类。
 *
 * <p>对可比较元素数组进行原地升序排序，采用带提前终止优化的冒泡排序算法。
 * 该类为工具类，不可实例化。
 */
public final class BubbleSorter {

    /**
     * 私有构造，禁止实例化。
     */
    private BubbleSorter() {
        // 工具类，禁止实例化
    }

    /**
     * 对可比较元素数组进行原地升序冒泡排序。
     *
     * <p>采用带提前终止（swapped 标志）的冒泡排序：若某一轮未发生任何交换，
     * 说明数组已有序，立即结束。相等元素采用严格大于（{@code > 0}）判定，
     * 不进行交换，保证排序的稳定性。
     *
     * @param arr 待排序数组，元素须实现 Comparable；不允许为 null 或含 null 元素
     * @param <T> 可比较元素类型
     * @throws NullPointerException 数组或其元素为 null 时抛出
     */
    public static <T extends Comparable<? super T>> void sort(T[] arr) {
        if (arr == null) {
            throw new NullPointerException("arr must not be null");
        }

        for (int i = 0, n = arr.length; i < n - 1; i++) {
            boolean swapped = false;
            // 每轮将当前未排序段 [0, n - i) 的最大值冒泡到末尾
            for (int j = 0; j < n - 1 - i; j++) {
                if (arr[j].compareTo(arr[j + 1]) > 0) {
                    T tmp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = tmp;
                    swapped = true;
                }
            }
            if (!swapped) {
                break; // 本轮无交换，数组已有序
            }
        }
    }
}

/**
 * 快速排序工具类.
 *
 * <p>提供对 {@code int[]} 数组的原地升序排序，采用三数取中法选取基准元素，
 * 以降低在已序或接近已序输入下退化为 O(n²) 的概率.</p>
 *
 * @author Generated
 * @date 2026/08/07
 */
public final class QuickSort {

    /**
     * 私有构造方法，禁止实例化工具类.
     */
    private QuickSort() {
    }

    /**
     * 对整型数组进行原地升序排序.
     *
     * <p>该方法会直接修改传入的数组，不返回新数组.
     * 传入 {@code null} 时抛出 {@link IllegalArgumentException}.</p>
     *
     * @param array 待排序的整型数组
     * @throws IllegalArgumentException 当 array 为 null 时
     */
    public static void sort(int[] array) {
        if (array == null) {
            throw new IllegalArgumentException("待排序数组不能为 null");
        }
        quickSort(array, 0, array.length - 1);
    }

    /**
     * 递归执行快速排序.
     *
     * @param array 待排序数组
     * @param low   当前分区的起始下标（含）
     * @param high  当前分区的结束下标（含）
     */
    private static void quickSort(int[] array, int low, int high) {
        // 子区间长度小于等于1时无需排序
        if (low >= high) {
            return;
        }
        int pivotIndex = partition(array, low, high);
        quickSort(array, low, pivotIndex - 1);
        quickSort(array, pivotIndex + 1, high);
    }

    /**
     * 分区操作：选取基准元素并将其放置到最终位置，使左侧均小于等于基准、右侧均大于基准.
     *
     * @param array 待分区数组
     * @param low   起始下标（含）
     * @param high  结束下标（含）
     * @return 基准元素的最终下标
     */
    private static int partition(int[] array, int low, int high) {
        // 三数取中选取基准，避免已序输入退化为最坏情况
        int pivot = medianOfThree(array, low, high);
        // 基准元素先交换到区间末尾
        swap(array, high, pivot);
        int pivotValue = array[high];
        int storeIndex = low;
        for (int i = low; i < high; i++) {
            if (array[i] <= pivotValue) {
                swap(array, i, storeIndex);
                storeIndex++;
            }
        }
        // 将基准元素放回分界位置
        swap(array, storeIndex, high);
        return storeIndex;
    }

    /**
     * 三数取中法：比较首、中、尾三个元素，返回中间值元素的下标.
     *
     * @param array 数组
     * @param low   起始下标
     * @param high  结束下标
     * @return 中间值元素的下标
     */
    private static int medianOfThree(int[] array, int low, int high) {
        int mid = low + (high - low) / 2;
        // 通过两两比较确定中间值，整型比较可使用 == / != ，这里用大小关系判断
        boolean lowLessEqualMid = array[low] <= array[mid];
        boolean midLessEqualHigh = array[mid] <= array[high];
        if (lowLessEqualMid == midLessEqualHigh) {
            return mid;
        }
        boolean lowLessEqualHigh = array[low] <= array[high];
        if (lowLessEqualMid != lowLessEqualHigh) {
            return low;
        }
        return high;
    }

    /**
     * 交换数组中两个下标位置的元素.
     *
     * @param array 数组
     * @param i     下标 i
     * @param j     下标 j
     */
    private static void swap(int[] array, int i, int j) {
        if (i == j) {
            return;
        }
        int temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

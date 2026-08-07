import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * {@link QuickSort} 单元测试.
 *
 * <p>覆盖普通、空数组、单元素、已序、逆序、重复元素及 null 入参等场景.</p>
 *
 * @author Generated
 * @date 2026/08/07
 */
@DisplayName("QuickSort 快速排序测试")
class QuickSortTest {

    @Test
    @DisplayName("should_sort_correctly_when_input_is_normal_array")
    void shouldSortCorrectlyWhenInputIsNormalArray() {
        // Given
        int[] array = {5, 3, 8, 1, 9, 2, 7, 4, 6};
        int[] expected = {1, 2, 3, 4, 5, 6, 7, 8, 9};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(expected);
    }

    @Test
    @DisplayName("should_return_empty_when_input_is_empty_array")
    void shouldReturnEmptyWhenInputIsEmptyArray() {
        // Given
        int[] array = {};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).isEmpty();
    }

    @Test
    @DisplayName("should_keep_unchanged_when_input_has_single_element")
    void shouldKeepUnchangedWhenInputHasSingleElement() {
        // Given
        int[] array = {42};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(42);
    }

    @Test
    @DisplayName("should_keep_unchanged_when_input_already_sorted")
    void shouldKeepUnchangedWhenInputAlreadySorted() {
        // Given
        int[] array = {1, 2, 3, 4, 5, 6, 7, 8, 9};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9);
    }

    @Test
    @DisplayName("should_sort_correctly_when_input_is_reverse_sorted")
    void shouldSortCorrectlyWhenInputIsReverseSorted() {
        // Given
        int[] array = {9, 8, 7, 6, 5, 4, 3, 2, 1};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(1, 2, 3, 4, 5, 6, 7, 8, 9);
    }

    @Test
    @DisplayName("should_sort_correctly_when_input_has_duplicate_elements")
    void shouldSortCorrectlyWhenInputHasDuplicateElements() {
        // Given
        int[] array = {3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5};
        int[] expected = {1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(expected);
    }

    @Test
    @DisplayName("should_sort_correctly_when_input_has_negative_and_positive")
    void shouldSortCorrectlyWhenInputHasNegativeAndPositive() {
        // Given
        int[] array = {0, -1, 5, -3, 2, -8, 7};
        int[] expected = {-8, -3, -1, 0, 2, 5, 7};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(expected);
    }

    @Test
    @DisplayName("should_throw_IllegalArgumentException_when_input_is_null")
    void shouldThrowIllegalArgumentExceptionWhenInputIsNull() {
        // Given
        int[] array = null;
        // When / Then
        assertThatThrownBy(() -> QuickSort.sort(array))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("不能为 null");
    }

    @Test
    @DisplayName("should_sort_correctly_when_input_has_two_elements")
    void shouldSortCorrectlyWhenInputHasTwoElements() {
        // Given
        int[] array = {2, 1};
        // When
        QuickSort.sort(array);
        // Then
        assertThat(array).containsExactly(1, 2);
    }
}

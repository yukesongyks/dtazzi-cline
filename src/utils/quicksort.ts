/**
 * quicksort.ts
 *
 * 快速排序算法的通用实现
 * 支持自定义比较器，可用于任意可排序类型的数组
 */

/**
 * 默认比较器：适用于数字、字符串等基本类型的升序排序
 */
function defaultCompare<T>(a: T, b: T): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/**
 * 原地分区（Hoare 分区方案）
 * 将数组分为两部分：小于等于 pivot 的元素和大于等于 pivot 的元素
 * @returns pivot 的最终索引位置
 */
function partition<T>(
	arr: T[],
	low: number,
	high: number,
	compare: (a: T, b: T) => number,
): number {
	// 选择最右侧元素作为 pivot
	const pivot = arr[high];
	let i = low - 1;

	for (let j = low; j < high; j++) {
		if (compare(arr[j], pivot) <= 0) {
			i++;
			// 交换 arr[i] 和 arr[j]
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	// 将 pivot 放到正确的位置
	[arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
	return i + 1;
}

/**
 * 递归执行快速排序
 */
function quickSortRecursive<T>(
	arr: T[],
	low: number,
	high: number,
	compare: (a: T, b: T) => number,
): void {
	if (low < high) {
		// 获取分区点
		const pi = partition(arr, low, high, compare);

		// 递归排序左右两部分
		quickSortRecursive(arr, low, pi - 1, compare);
		quickSortRecursive(arr, pi + 1, high, compare);
	}
}

/**
 * 快速排序 - 原地排序数组
 *
 * @param arr 要排序的数组（会被修改）
 * @param compare 可选的自定义比较器函数
 * @returns 排序后的数组（与输入是同一个引用）
 *
 * @example
 * ```ts
 * const numbers = [3, 1, 4, 1, 5, 9, 2, 6];
 * quickSort(numbers); // [1, 1, 2, 3, 4, 5, 6, 9]
 *
 * const objects = [{ age: 30 }, { age: 20 }];
 * quickSort(objects, (a, b) => a.age - b.age); // [{ age: 20 }, { age: 30 }]
 * ```
 */
export function quickSort<T>(
	arr: T[],
	compare?: (a: T, b: T) => number,
): T[] {
	if (arr.length <= 1) {
		return arr;
	}

	const comparator = compare ?? defaultCompare;
	quickSortRecursive(arr, 0, arr.length - 1, comparator);
	return arr;
}

/**
 * 快速排序 - 返回新数组（不修改原数组）
 *
 * @param arr 要排序的数组（不会被修改）
 * @param compare 可选的自定义比较器函数
 * @returns 排序后的新数组
 *
 * @example
 * ```ts
 * const numbers = [3, 1, 4, 1, 5];
 * const sorted = quickSortImmutable(numbers); // [1, 1, 3, 4, 5]
 * // numbers 保持不变
 * ```
 */
export function quickSortImmutable<T>(
	arr: readonly T[],
	compare?: (a: T, b: T) => number,
): T[] {
	const copy = [...arr];
	return quickSort(copy, compare);
}

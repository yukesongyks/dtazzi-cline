import { describe, expect, it } from "vitest";

import { quickSort, quickSortImmutable } from "../../src/utils/quicksort";

describe("quickSort", () => {
	describe("basic sorting", () => {
		it("sorts an array of numbers in ascending order", () => {
			const arr = [3, 1, 4, 1, 5, 9, 2, 6];
			quickSort(arr);
			expect(arr).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);
		});

		it("sorts an array of strings alphabetically", () => {
			const arr = ["banana", "apple", "cherry", "date"];
			quickSort(arr);
			expect(arr).toEqual(["apple", "banana", "cherry", "date"]);
		});

		it("handles an already sorted array", () => {
			const arr = [1, 2, 3, 4, 5];
			quickSort(arr);
			expect(arr).toEqual([1, 2, 3, 4, 5]);
		});

		it("handles a reverse sorted array", () => {
			const arr = [5, 4, 3, 2, 1];
			quickSort(arr);
			expect(arr).toEqual([1, 2, 3, 4, 5]);
		});
	});

	describe("edge cases", () => {
		it("handles an empty array", () => {
			const arr: number[] = [];
			quickSort(arr);
			expect(arr).toEqual([]);
		});

		it("handles a single element array", () => {
			const arr = [42];
			quickSort(arr);
			expect(arr).toEqual([42]);
		});

		it("handles an array with duplicate elements", () => {
			const arr = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
			quickSort(arr);
			expect(arr).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]);
		});

		it("handles an array with all identical elements", () => {
			const arr = [7, 7, 7, 7, 7];
			quickSort(arr);
			expect(arr).toEqual([7, 7, 7, 7, 7]);
		});

		it("handles negative numbers", () => {
			const arr = [-3, 1, -4, 0, 5, -2];
			quickSort(arr);
			expect(arr).toEqual([-4, -3, -2, 0, 1, 5]);
		});
	});

	describe("custom comparator", () => {
		it("sorts in descending order with a custom comparator", () => {
			const arr = [3, 1, 4, 1, 5, 9, 2, 6];
			quickSort(arr, (a, b) => b - a);
			expect(arr).toEqual([9, 6, 5, 4, 3, 2, 1, 1]);
		});

		it("sorts objects by a property", () => {
			interface Person {
				name: string;
				age: number;
			}

			const arr: Person[] = [
				{ name: "Alice", age: 30 },
				{ name: "Bob", age: 25 },
				{ name: "Charlie", age: 35 },
			];
			quickSort(arr, (a, b) => a.age - b.age);
			expect(arr).toEqual([
				{ name: "Bob", age: 25 },
				{ name: "Alice", age: 30 },
				{ name: "Charlie", age: 35 },
			]);
		});

		it("sorts strings by length", () => {
			const arr = ["a", "hello", "hi", "world", "x"];
			quickSort(arr, (a, b) => a.length - b.length);
			expect(arr).toEqual(["a", "x", "hi", "hello", "world"]);
		});
	});

	describe("mutability", () => {
		it("modifies the array in place (same reference)", () => {
			const arr = [3, 1, 4, 1, 5];
			const result = quickSort(arr);
			expect(result).toBe(arr);
			expect(arr).toEqual([1, 1, 3, 4, 5]);
		});
	});
});


describe("quickSortImmutable", () => {
	it("returns a new sorted array without modifying the original", () => {
		const original = [3, 1, 4, 1, 5];
		const sorted = quickSortImmutable(original);

		expect(sorted).toEqual([1, 1, 3, 4, 5]);
		expect(original).toEqual([3, 1, 4, 1, 5]);
		expect(sorted).not.toBe(original);
	});

	it("works with custom comparators", () => {
		const original = [3, 1, 4, 1, 5];
		const sorted = quickSortImmutable(original, (a, b) => b - a);

		expect(sorted).toEqual([5, 4, 3, 1, 1]);
		expect(original).toEqual([3, 1, 4, 1, 5]);
	});

	it("handles empty arrays", () => {
		const original: number[] = [];
		const sorted = quickSortImmutable(original);

		expect(sorted).toEqual([]);
		expect(sorted).not.toBe(original);
	});
});

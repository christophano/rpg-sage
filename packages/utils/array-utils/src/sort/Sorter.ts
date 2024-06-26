import type { Optional } from "@rsc-utils/type-utils";
import type { SortResult } from "./SortResult.js";

export type Sorter<T> = (a: Optional<T>, b: Optional<T>) => SortResult;
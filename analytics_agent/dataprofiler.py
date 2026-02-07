import polars as pl
import re

class DataProfiler:
    @staticmethod
    def get_profile(df: pl.DataFrame):
        total_rows = len(df)
        column_profiles = {}

        for col in df.columns:
            series = df[col]
            base_dtype = series.dtype
            null_count = series.null_count()
            
            # --- FR-101: Type Inference & Mixed Detection ---
            inferred_type = str(base_dtype)
            is_mixed = False
            
            if base_dtype == pl.String:
                sample = series.drop_nulls().head(100).to_list()
                unique_python_types = {type(x) for x in sample}
                if len(unique_python_types) > 1:
                    inferred_type = "mixed"
                    is_mixed = True

            # --- FR-102: Missing & Unique Constraints ---
            # n_unique() by default includes nulls as a unique value. 
            # We subtract 1 if nulls exist to get the count of unique DATA values.
            raw_unique = series.n_unique()
            unique_values_count = raw_unique - 1 if null_count > 0 else raw_unique

            stats = {
                "inferred_type": inferred_type,
                "is_mixed": is_mixed,
                "null_count": null_count,              # FR-102: Missing count
                "missing_pct": round((null_count / total_rows) * 100, 2) if total_rows > 0 else 0,
                "unique_count": unique_values_count,   # FR-102: Unique count
                "is_unique": unique_values_count == (total_rows - null_count) and total_rows > 0, # Constraint Check
                "invalid_count": 0
            }

            # --- Numeric Stats ---
            if base_dtype.is_numeric():
                stats.update({
                    "min": series.min(), 
                    "max": series.max(),
                    "mean": round(series.mean(), 2) if series.mean() else 0,
                    "std": round(series.std(), 2) if series.std() else 0
                })
            
            # --- Date Range & Invalid Date Parsing ---
            if base_dtype in [pl.Date, pl.Datetime] or "date" in col.lower():
                try:
                    if base_dtype == pl.String:
                        parsed = series.str.to_datetime(strict=False)
                        # FR-102: Count values that failed to parse as dates
                        stats["invalid_count"] = parsed.null_count() - null_count
                        if stats["invalid_count"] < total_rows:
                            stats["date_range"] = {"min": str(parsed.min()), "max": str(parsed.max())}
                    else:
                        stats["date_range"] = {"min": str(series.min()), "max": str(series.max())}
                except: pass

            # --- Categorical Top 10 ---
            if not base_dtype.is_numeric() and not base_dtype.is_temporal():
                stats["top_10"] = series.value_counts().sort("count", descending=True).head(10).to_dicts()

            column_profiles[col] = stats

        # --- FR-103: Duplicate Detection ---
        duplicate_count = total_rows - len(df.unique())
        id_pattern = re.compile(r"(id|email|phone|uuid|key)", re.IGNORECASE)
        # Suggest keys if the column name looks like an ID AND it is 100% unique
        candidate_keys = [
            col for col in df.columns 
            if id_pattern.search(col) and column_profiles[col]["is_unique"]
        ]

        # --- FR-104: Quality Score ---
        
        # 1. Sum nulls horizontally across the 1-row DataFrame returned by null_count()
        # null_count() -> 1 row, multiple columns
        # sum_horizontal() -> 1 column (Series) containing the total
        total_nulls_series = df.null_count().select(pl.sum_horizontal(pl.all()))
        total_nulls = total_nulls_series[0, 0] # Get the first value from the first row

        total_cells = total_rows * len(df.columns)

        # 2. Calculate penalties
        null_penalty = (total_nulls / total_cells) * 30 if total_cells > 0 else 0
        dup_penalty = (duplicate_count / total_rows) * 40 if total_rows > 0 else 0
        
        # 3. Final score
        quality_score = max(0, 100 - null_penalty - dup_penalty)

        return {
            "total_rows": total_rows,
            "duplicate_count": duplicate_count,
            "candidate_keys": candidate_keys,
            "quality_score": round(quality_score, 1),
            "columns": column_profiles
        }
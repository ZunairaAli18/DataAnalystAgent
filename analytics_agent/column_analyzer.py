import polars as pl
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import statistics
from enum import Enum


class DataType(str, Enum):
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    TEMPORAL = "temporal"
    MIXED = "mixed"


@dataclass
class ColumnInsight:
    column_name: str
    data_type: str
    description: str
    insights: List[str]
    recommendations: List[str]
    graph_type: str
    graph_data: Dict[str, Any]
    statistics: Dict[str, Any]


class ColumnAnalyzer:
    """Analyze individual columns and generate graphs, descriptions, insights, and recommendations"""
    
    @staticmethod
    def analyze_column(df: pl.DataFrame, column_name: str) -> ColumnInsight:
        """
        Comprehensive analysis of a single column.
        Returns graph data, description, insights, and recommendations.
        """
        series = df[column_name]
        dtype = series.dtype
        
        # Determine column type
        col_type = ColumnAnalyzer._determine_type(series, dtype)
        
        # Generate statistics
        stats = ColumnAnalyzer._get_statistics(series, col_type)
        
        # Generate description
        description = ColumnAnalyzer._generate_description(column_name, col_type, stats)
        
        # Generate insights
        insights = ColumnAnalyzer._generate_insights(series, col_type, stats)
        
        # Generate recommendations
        recommendations = ColumnAnalyzer._generate_recommendations(series, col_type, stats)
        
        # Generate graph data
        graph_type, graph_data = ColumnAnalyzer._generate_graph_data(series, col_type, stats)
        
        return ColumnInsight(
            column_name=column_name,
            data_type=col_type,
            description=description,
            insights=insights,
            recommendations=recommendations,
            graph_type=graph_type,
            graph_data=graph_data,
            statistics=stats
        )
    
    @staticmethod
    def _determine_type(series: pl.Series, dtype: pl.DataType) -> str:
        """Determine the semantic type of a column"""
        
        # Check temporal types
        if dtype in [pl.Date, pl.Datetime, pl.Duration]:
            return DataType.TEMPORAL
        
        # Check numeric types
        if dtype.is_numeric():
            return DataType.NUMERIC
        
        # Check if it's a string that represents numbers
        if dtype == pl.String:
            non_null = series.drop_nulls()
            if len(non_null) > 0:
                # Sample to check if numeric
                sample = non_null.head(100).to_list()
                try:
                    [float(x) for x in sample if x is not None]
                    return DataType.NUMERIC
                except (ValueError, TypeError):
                    return DataType.CATEGORICAL
            return DataType.CATEGORICAL
        
        return DataType.CATEGORICAL
    
    @staticmethod
    def _get_statistics(series: pl.Series, col_type: str) -> Dict[str, Any]:
        """Generate statistics for a column"""
        stats = {
            "total_count": len(series),
            "null_count": series.null_count(),
            "null_percentage": round((series.null_count() / len(series) * 100), 2),
            "unique_count": series.n_unique() - (1 if series.null_count() > 0 else 0),
        }
        
        if col_type == DataType.NUMERIC:
            non_null = series.drop_nulls()
            if len(non_null) > 0:
                values = non_null.to_list()
                stats.update({
                    "min": round(min(values), 2),
                    "max": round(max(values), 2),
                    "mean": round(sum(values) / len(values), 2),
                    "median": round(statistics.median(values), 2),
                    "std_dev": round(statistics.stdev(values), 2) if len(values) > 1 else 0,
                })
        
        elif col_type == DataType.CATEGORICAL:
            value_counts = series.value_counts().sort("count", descending=True).head(10)
            stats["top_values"] = [
                {"value": row[""].as_py(), "count": row["count"].as_py()}
                for row in value_counts.iter_rows(named=True)
            ]
        
        elif col_type == DataType.TEMPORAL:
            non_null = series.drop_nulls()
            if len(non_null) > 0:
                stats["min_date"] = str(non_null.min())
                stats["max_date"] = str(non_null.max())
        
        return stats
    
    @staticmethod
    def _generate_description(column_name: str, col_type: str, stats: Dict) -> str:
        """Generate a human-readable description of the column"""
        
        null_pct = stats.get("null_percentage", 0)
        total = stats.get("total_count", 0)
        
        if col_type == DataType.NUMERIC:
            mean = stats.get("mean", 0)
            min_val = stats.get("min", 0)
            max_val = stats.get("max", 0)
            return (
                f"'{column_name}' is a numeric column with {total} total values. "
                f"Values range from {min_val} to {max_val} with an average of {mean}. "
                f"{null_pct}% of values are missing."
            )
        
        elif col_type == DataType.CATEGORICAL:
            unique = stats.get("unique_count", 0)
            return (
                f"'{column_name}' is a categorical column containing {unique} unique values "
                f"across {total} total records. {null_pct}% of values are missing."
            )
        
        elif col_type == DataType.TEMPORAL:
            min_date = stats.get("min_date", "Unknown")
            max_date = stats.get("max_date", "Unknown")
            return (
                f"'{column_name}' is a temporal column spanning from {min_date} to {max_date}. "
                f"{null_pct}% of values are missing."
            )
        
        return f"'{column_name}' contains {total} values with {null_pct}% missing data."
    
    @staticmethod
    def _generate_insights(series: pl.Series, col_type: str, stats: Dict) -> List[str]:
        """Generate key insights about the column"""
        insights = []
        
        null_pct = stats.get("null_percentage", 0)
        if null_pct > 20:
            insights.append(f"⚠️ High missing data: {null_pct}% of values are null. Consider data imputation.")
        elif null_pct > 0:
            insights.append(f"📊 Contains {null_pct}% missing values that should be handled.")
        
        if col_type == DataType.NUMERIC:
            mean = stats.get("mean", 0)
            std = stats.get("std_dev", 0)
            min_val = stats.get("min", 0)
            max_val = stats.get("max", 0)
            
            # Check for outliers
            if std > 0:
                outlier_threshold = mean + (3 * std)
                if max_val > outlier_threshold:
                    insights.append(f"🔴 Potential outliers detected: Maximum value ({max_val}) exceeds 3σ threshold.")
            
            # Check for skewness
            median = stats.get("median", 0)
            if mean > median * 1.5:
                insights.append("📈 Right-skewed distribution detected. Data may benefit from log transformation.")
            elif median > mean * 1.5:
                insights.append("📉 Left-skewed distribution detected.")
            
            # Check spread
            range_val = max_val - min_val
            if range_val == 0:
                insights.append("⚠️ All values are identical - no variance in this column.")
        
        elif col_type == DataType.CATEGORICAL:
            unique = stats.get("unique_count", 0)
            total = stats.get("total_count", 0)
            cardinality = (unique / total * 100) if total > 0 else 0
            
            if cardinality > 90:
                insights.append(f"🔹 Very high cardinality ({cardinality:.1f}%) - nearly all values are unique.")
            elif cardinality < 5:
                insights.append(f"🔹 Low cardinality ({cardinality:.1f}%) - values are heavily concentrated.")
        
        if len(insights) == 0:
            insights.append("✅ Column appears to be in good condition.")
        
        return insights
    
    @staticmethod
    def _generate_recommendations(series: pl.Series, col_type: str, stats: Dict) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []
        
        null_pct = stats.get("null_percentage", 0)
        if null_pct > 10:
            recommendations.append(f"Consider imputing missing values using mean/median or domain-specific methods.")
        
        if col_type == DataType.NUMERIC:
            std = stats.get("std_dev", 0)
            mean = stats.get("mean", 0)
            max_val = stats.get("max", 0)
            
            if std > 0 and mean > 0:
                cv = (std / abs(mean)) * 100  # Coefficient of variation
                if cv > 100:
                    recommendations.append("High variability detected. Consider normalization or standardization for modeling.")
            
            # Skewness handling
            median = stats.get("median", 0)
            if mean > median * 1.5:
                recommendations.append("Apply log transformation to handle right-skew and improve model performance.")
        
        elif col_type == DataType.CATEGORICAL:
            top_values = stats.get("top_values", [])
            if top_values:
                top_count = top_values[0].get("count", 0)
                total = stats.get("total_count", 0)
                if top_count / total > 0.8:
                    recommendations.append("Column is heavily imbalanced. Consider grouping rare categories or using stratified sampling.")
            
            unique = stats.get("unique_count", 0)
            if unique > 50:
                recommendations.append("High number of categories. Consider one-hot encoding or target encoding for modeling.")
        
        if len(recommendations) == 0:
            recommendations.append("Column is well-suited for analysis and modeling. No specific actions needed.")
        
        return recommendations
    
    @staticmethod
    def _generate_graph_data(series: pl.Series, col_type: str, stats: Dict) -> tuple:
        """Generate data for visualization"""
        
        if col_type == DataType.NUMERIC:
            # Generate histogram data
            non_null = series.drop_nulls()
            if len(non_null) > 0:
                min_val = stats.get("min", 0)
                max_val = stats.get("max", 0)
                
                # Create 20 bins
                bin_count = min(20, max(5, len(non_null) // 10))
                bin_width = (max_val - min_val) / bin_count if max_val > min_val else 1
                
                bins = [{"range": f"{round(min_val + i*bin_width, 2)}", "count": 0} 
                        for i in range(bin_count + 1)]
                
                for val in non_null.to_list():
                    if isinstance(val, (int, float)):
                        bin_idx = min(int((val - min_val) / bin_width) if bin_width > 0 else 0, bin_count - 1)
                        bins[bin_idx]["count"] += 1
                
                graph_data = {
                    "bins": bins,
                    "distribution_type": "histogram",
                }
            else:
                graph_data = {"bins": [], "distribution_type": "histogram"}
            
            return "histogram", graph_data
        
        elif col_type == DataType.CATEGORICAL:
            top_values = stats.get("top_values", [])
            graph_data = {
                "categories": [item["value"] for item in top_values],
                "counts": [item["count"] for item in top_values],
            }
            return "bar", graph_data
        
        elif col_type == DataType.TEMPORAL:
            # Return timeline data
            graph_data = {
                "min_date": stats.get("min_date", ""),
                "max_date": stats.get("max_date", ""),
                "null_count": stats.get("null_count", 0),
            }
            return "timeline", graph_data
        
        return "table", {}
    
    @staticmethod
    def analyze_all_columns(df: pl.DataFrame) -> List[Dict[str, Any]]:
        """Analyze all columns and return results as dictionaries"""
        results = []
        for column in df.columns:
            insight = ColumnAnalyzer.analyze_column(df, column)
            results.append(asdict(insight))
        return results

import os
from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON, Boolean, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime
from dotenv import load_dotenv

load_dotenv()

# We use the direct Supabase Postgres connection
engine = create_engine(os.getenv("DATABASE_URL"))
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(String, primary_key=True)
    name = Column(String)
    source_type = Column(String)  # csv, sql, shopify
    s3_path = Column(String)
    row_count = Column(Integer)
    schema_json = Column(JSON)  # Stores column names and inferred types
    status = Column(String, default="processing")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationships
    versions = relationship("DatasetVersion", back_populates="dataset")

class DatasetVersion(Base):
    """
    FR-201: Version tracking for datasets
    Each cleaning operation creates a new version
    """
    __tablename__ = "dataset_versions"
    id = Column(String, primary_key=True)
    dataset_id = Column(String, ForeignKey("datasets.id"))
    version_name = Column(String)  # RAW_V1, CLEAN_V1, CLEAN_V2
    s3_path = Column(String)  # Path to this version's data
    is_default = Column(Boolean, default=False)  # Which version to use for dashboards
    row_count = Column(Integer)
    schema_json = Column(JSON)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_by = Column(String, nullable=True)  # user_id
    
    # Relationships
    dataset = relationship("Dataset", back_populates="versions")
    transform_logs = relationship("TransformLog", back_populates="version")
    anomalies = relationship("Anomaly", back_populates="version")

class TransformLog(Base):
    """
    FR-207: Audit trail for all cleaning operations
    """
    __tablename__ = "transform_logs"
    id = Column(String, primary_key=True)
    dataset_version_id = Column(String, ForeignKey("dataset_versions.id"))
    operation = Column(String)  # dedupe, fill_missing, cast_type, normalize, etc.
    params_json = Column(JSON)  # Parameters used for the operation
    rows_affected = Column(Integer)  # How many rows were changed/removed
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    user_id = Column(String, nullable=True)
    
    # Relationships
    version = relationship("DatasetVersion", back_populates="transform_logs")

class Anomaly(Base):
    """
    FR-206: Stores detected anomalies separately
    Anomalies are NOT deleted from the dataset by default
    """
    __tablename__ = "anomalies"
    id = Column(String, primary_key=True)
    dataset_version_id = Column(String, ForeignKey("dataset_versions.id"))
    row_data = Column(JSON)  # The actual anomalous row as JSON
    column = Column(String)  # Which column triggered the anomaly
    reason = Column(String)  # "outlier_iqr", "outlier_zscore", etc.
    score = Column(Float)  # Anomaly score (higher = more anomalous)
    detected_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Relationships
    version = relationship("DatasetVersion", back_populates="anomalies")

# Run once to create all tables in Supabase
Base.metadata.create_all(bind=engine)
from typing import Optional
from pydantic import BaseModel, Field


class MetricsIn(BaseModel):
    day: str = Field(description="YYYY-MM-DD")
    calorie_in: int
    calorie_out: int
    protein_g: int
    weight_kg: float
    notes: Optional[str] = None


class MetricsOut(MetricsIn):
    pass


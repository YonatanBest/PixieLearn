from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class UserSettings(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    theme: Literal["dark", "light", "system"] = "dark"
    font_size: Literal["small", "medium", "large"] = "medium"
    learning_level: Literal["Beginner", "Intermediate", "Advanced"] = "Intermediate"
    teaching_style: Literal["Simple and intuitive", "Step-by-step", "Technical and detailed"] = "Step-by-step"
    continue_automatically: bool = True
    speaking_speed: Literal["0.8x", "1.0x", "1.2x", "1.5x"] = "1.0x"
    voice: Literal["Pixie · Calm", "Pixie · Bright"] = "Pixie · Calm"
    auto_play_explanations: bool = True
    caption_position: Literal["Bottom center", "Center"] = "Bottom center"
    caption_text_size: Literal["Small", "Medium", "Large"] = "Medium"
    caption_contrast: int = Field(default=100, ge=70, le=140)
    caption_transparency: int = Field(default=18, ge=0, le=70)
    reduce_motion: bool = False
    default_document_zoom: Literal["Fit to width", "100%", "120%"] = "Fit to width"
    search_scope: Literal["Current page", "Entire document"] = "Entire document"
    remember_last_page: bool = True

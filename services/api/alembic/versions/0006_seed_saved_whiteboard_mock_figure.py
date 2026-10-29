"""Replace the static whiteboard JSX mock with a saved Mermaid figure.

Revision ID: 0006_saved_whiteboard_mock
Revises: 0005_document_learning_state
Create Date: 2026-10-23
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006_saved_whiteboard_mock"
down_revision: Union[str, None] = "0005_document_learning_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE document_learning_states
        SET workspace_state = jsonb_set(
            workspace_state,
            '{whiteboardDiagrams}',
            jsonb_build_array(jsonb_build_object(
                'id', 'mock-scaled-dot-product',
                'title', 'Scaled dot-product attention',
                'createdBy', 'mock',
                'source', $diagram$flowchart LR
  Q["Query (Q)"] --> S["Similarity scores"]
  K["Keys (K)"] --> S
  S --> X["Scale by √d_k"]
  X --> W["Softmax weights"]
  W --> O["Weighted sum"]
  V["Values (V)"] --> O
  classDef input fill:#ede9fe,stroke:#6f62d9,color:#27282b
  classDef process fill:#e6eefb,stroke:#6484c2,color:#27282b
  classDef result fill:#e1f2e9,stroke:#4b9675,color:#27282b
  class Q,K,V input
  class S,X,W process
  class O result$diagram$
            )),
            true
        )
        WHERE NOT (workspace_state ? 'whiteboardDiagrams')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE document_learning_states AS saved_state
        SET workspace_state = (
            SELECT CASE WHEN count(*) = 0
                THEN saved_state.workspace_state - 'whiteboardDiagrams'
                ELSE jsonb_set(
                    saved_state.workspace_state,
                    '{whiteboardDiagrams}',
                    jsonb_agg(diagram),
                    true
                )
            END
                FROM jsonb_array_elements(saved_state.workspace_state->'whiteboardDiagrams') AS item(diagram)
                WHERE diagram->>'id' <> 'mock-scaled-dot-product'
        )
        WHERE saved_state.workspace_state->'whiteboardDiagrams' @> '[{"id":"mock-scaled-dot-product"}]'::jsonb
        """
    )

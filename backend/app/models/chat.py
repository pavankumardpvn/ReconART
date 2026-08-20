"""Chat session and message models for the AI agent."""

from sqlalchemy import Column, String, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import TenantMixin
from app.database import Base


class ChatSession(TenantMixin, Base):
    __tablename__ = "chat_sessions"

    user_id = Column(String, nullable=False)
    title = Column(String(255), nullable=True)
    status = Column(String(20), default="active")

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant, system
    text = Column(Text, nullable=False)
    action = Column(JSON, nullable=True)
    action_status = Column(String(20), nullable=True)  # pending, confirmed, cancelled, done
    created_at = Column(String, server_default="now()")

    session = relationship("ChatSession", back_populates="messages")

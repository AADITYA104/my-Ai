---
name: 3-structured-output-agent
description: "🎯 Tutorial 3: Structured Output Agent"
category: design_frontend
---

# 🎯 Tutorial 3: Structured Output Agent

Welcome to structured output! This tutorial teaches you how to create agents that return **type-safe, structured data** instead of plain text. This is crucial for building reliable applications that need predictable data formats.

## 🎯 What You'll Learn

- **Pydantic Schemas**: Define data structures with validation
- **Type Safety**: Ensure your agents return expected data formats
- **Business Logic**: Process structured data reliably
- **Error Handling**: Graceful handling of validation errors
- **Real-world Applications**: Customer support and email generation

## 🧠 Core Concept: Structured Output

Structured output means your agent returns **validated data objects** instead of raw text:
- ✅ **Type Safety**: Know exactly what data format you'll receive
- ✅ **Validation**: Automatic checking of required fields and data types
- ✅ **Reliability**: No more parsing text responses manually
- ✅ **Integration**: Easy to use in applications and databases

### Why Structured Output?
- **Predictable**: Always get the same data structure
- **Validated**: Pydantic ensures data correctness
- **Typed**: Full IDE support and type checking
- **Scalable**: Easy to modify and extend schemas

## 🚀 Tutorial Structure

This tutorial contains **two comprehensive examples**:

### 📍 **Example 1: Customer Support Ticket Agent**
**Location**: `./3_1_customer_support_ticket_agent/`
- Extract structured ticket information from customer complaints
- Priority classification and urgency assessment
- Contact information extraction
- Department routing logic

### 📍 **Example 2: Email Generation Agent**
**Location**: `./3_2_email_agent/`
- Generate structured email content with metadata
- Subject line optimization
- Recipient classification
- Email template formatting

## 📁 Project Structure

```
3_structured_output_agent/
├── README.md                           # This tutorial overview
├── 3_1_customer_support_ticket_agent/  # Customer support example
└── 3_2_email_agent/                   # Email generation example
```

Each example directory follows the standard structure:
- **Python file**: Contains the agent implementation and Streamlit app
- **README.md**: Setup and usage documentation
- **requirements.txt**: Dependencies list

## 🎯 Learning Objectives

By the end of this tutorial, you'll understand:
- ✅ How to define Pydantic schemas for structured output
- ✅ How to configure agents to return structured data
- ✅ How to handle validation errors gracefully
- ✅ When to use structured output vs plain text
- ✅ Best practices for schema design

## 💡 Key Patterns

### Basic Structured Output Pattern
```python
from pydantic import BaseModel
from google.adk.agents import Agent

class TicketInfo(BaseModel):
    title: str
    priority: str
    category: str
    urgency_level: int

agent = Agent(
    name="support_agent",
    model="gemini-3-flash-preview",
    instruction="Extract ticket information...",
    response_format=TicketInfo,  # This ensures structured output!
)
```

### Advanced Schema with Validation
```python
from pydantic import BaseModel, Field, validator
from typing import List, Optional

class EmailData(BaseModel):
    subject: str = Field(..., min_length=5, max_length=100)
    recipients: List[str] = Field(..., min_items=1)
    priority: str = Field(..., regex="^(low|medium|high)$")
    
    @validator('recipients')
    def validate_emails(cls, v):
        # Custom email validation logic
        return v
```

## 🎯 Real-World Applications

Structured output agents are perfect for:
- **Customer Support**: Extracting ticket information from complaints
- **Data Processing**: Converting unstructured text to database records
- **Content Generation**: Creating structured content with metadata
- **Form Processing**: Extracting information from documents
- **API Integration**: Providing consistent data formats for other systems

## 💡 Pro Tips

- **Clear Schemas**: Use descriptive field names and add docstrings
- **Validation**: Add appropriate validators for your use case
- **Optional Fields**: Use `Optional` for fields that might be missing
- **Examples**: Provide example data in your schema documentation
- **Error Handling**: Always handle validation errors gracefully

## 🚨 Important Notes

- **Pydantic Required**: You need Pydantic for schema definitions
- **Model Support**: Not all models support structured output equally well
- **Validation Overhead**: Complex schemas may slow down responses
- **Schema Evolution**: Plan for schema changes in production systems

from sqlalchemy.dialects import mysql
from sqlalchemy import nullslast, Column, DateTime, Integer
from sqlalchemy.orm import declarative_base
from sqlalchemy import select

Base = declarative_base()

class T(Base):
    __tablename__ = 't'
    id = Column(Integer, primary_key=True)
    d = Column(DateTime)

try:
    q = select(T).order_by(nullslast(T.d.asc()))
    compiled_sql = q.compile(dialect=mysql.dialect())
    print("Compiled SQL successfully:")
    print(compiled_sql)
except Exception as e:
    print(f"Error during compilation: {e}")

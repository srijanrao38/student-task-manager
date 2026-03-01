from django.db import models
from django.contrib.auth.models import User

class Task(models.Model):
    PRIORITY_CHOICES =[
        ('LOW','LOW'),
        ('MEDIUM','MEDIUM'),
        ('HIGH','HIGH'),
    ]

    STATUS_CHOICES= [
        ('PENDING','PENDING'),
        ('COMPLETED','COMPLETED'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title= models.CharField(max_length=200)
    description= models.TextField(blank=True)
    subject= models.CharField(max_length=20)
    due_date=models.DateField()
    priority= models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default='MEDIUM'
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default='PENDING'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title 
# Create your models here.

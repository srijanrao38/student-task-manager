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


class TaskFile(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE)
    file = models.FileField(upload_to='task_files/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"File {self.file.name} for Task {self.task.title}"


class AIResponse(models.Model):
    RESPONSE_TYPES = [
        ('SOLUTION', 'Solution'),
        ('SUMMARY', 'Summary'),
        ('QUIZ', 'Quiz'),
    ]

    task = models.ForeignKey(Task, on_delete=models.CASCADE)
    response_type = models.CharField(max_length=20, choices=RESPONSE_TYPES, default='SOLUTION')
    extracted_text = models.TextField(blank=True, default='')
    generated_answer = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.response_type} for Task {self.task.title}"

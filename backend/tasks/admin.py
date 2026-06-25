from django.contrib import admin
from .models import Task, TaskFile, AIResponse

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display=(
        'title',
        'subject',
        'priority',
        'status',
        'due_date',
        'created_at',
        'updated_at'
    )

    list_filter=('priority','status','due_date')
    search_fields=('title','subject')


@admin.register(TaskFile)
class TaskFileAdmin(admin.ModelAdmin):
    list_display = ('task', 'file', 'uploaded_at')
    list_filter = ('uploaded_at',)


@admin.register(AIResponse)
class AIResponseAdmin(admin.ModelAdmin):
    list_display = ('task', 'response_type', 'created_at')
    list_filter = ('response_type', 'created_at')

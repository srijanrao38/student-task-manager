from django.contrib import admin
from .models import Task

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


# Register your models here.

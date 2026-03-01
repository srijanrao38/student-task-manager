from django.shortcuts import render,redirect,get_object_or_404
from .models import Task
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login


@csrf_exempt

def api_task(request):
    current_user = request.user
    if current_user.is_anonymous:
        
        current_user = request.user if not request.user.is_anonymous else User.objects.first()

    if request.method == "GET":
        tasks = Task.objects.filter(user=request.user)
        data = []
        

        for task in tasks:
            data.append({
                "id": task.id,
                "title": task.title,
                "subject": task.subject,
                "priority": task.priority,
                "status": task.status,
            })

        return JsonResponse(data, safe=False)

    elif request.method == "POST":
        body = json.loads(request.body)

        task = Task.objects.create(
            user=request.user,
            title=body["title"],
            subject=body["subject"],
            priority=body["priority"],
            status="PENDING",
            due_date=body.get("due_date")
        )

        return JsonResponse({
            "id": task.id,
            "title": task.title,
            "subject": task.subject,
            "priority": task.priority,
            "status": task.status,
        })

     
@login_required
def home(request):
    
    
    if request.method =="POST":
        title = request.POST.get("title")
        subject= request.POST.get("subject")
        due_date = request.POST.get("due_date")
        priority = request.POST.get("priority")

        Task.objects.create(
            user=request.user,
            title=title,
            subject=subject,
            due_date=due_date,
            priority=priority,
        )
        return redirect('home')
        
    tasks = Task.objects.filter(user=request.user).order_by('-created_at')

    total_tasks=tasks.count()
    completed_task=tasks.filter(status='COMPLETED').count()
    pending_task=tasks.filter(status='PENDING').count()

    context={
         "tasks":tasks,
         "total_tasks": total_tasks,
         "completed_task":completed_task,
         "pending_task":pending_task,
    }
    return render(request,'tasks/home.html', context)
    
        
    

def register(request):
    if request.method=="POST":
        form = UserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('login')
    else:
            form = UserCreationForm()

    return render(request,'registration/register.html', {'form': form})

@login_required
@csrf_exempt # Add this if you aren't sending CSRF tokens from React

def delete_task(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)
    task.delete()
    return JsonResponse({"message": "Deleted successfully"}, status=200)

@login_required
def edit_task(request,task_id):
     task= get_object_or_404(Task, id=task_id, user=request.user)
     if request.method=="POST":
        task.title =request.POST.get("title")
        task.subject=request.POST.get("subject")
        task.due_date=request.POST.get("due_date")
        task.priority=request.POST.get("priority")
        task.save()
        return redirect('home')
     return render(request, "tasks/edit_task.html",{"task": task})

@csrf_exempt
def toggle_status(request, task_id):
    # Retrieve the specific task
    task = get_object_or_404(Task, id=task_id)
    
    # Toggle logic
    if task.status == 'PENDING':
        task.status = 'COMPLETED'
    else:
        task.status = 'PENDING'
    
    task.save()
    
    # Return the new status to the frontend
    return JsonResponse({
        "id": task.id,
        "status": task.status
    })

# backend/tasks/views.py
@csrf_exempt
def register_user(request):
    if request.method == "POST":
        data = json.loads(request.body)
        try:
            # Create the user in the Django Auth system
            user = User.objects.create_user(
                username=data['username'],
                email=data['email'],
                password=data['password']
            )
            user.first_name = data.get('first_name', '')
            user.save()
            return JsonResponse({"status": "success", "message": "User created!"})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

@csrf_exempt
def manual_login(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            username = data.get("username") # Now matches the React 'name' attribute
            password = data.get("password")

            # Django checks the auth_user table for this username/password combo
            user = authenticate(username=username, password=password)
            
            if user is not None:
                login(request, user)
                return JsonResponse({
                    "status": "success", 
                    "user": {
                        "name": user.username, # Shows the username on the dashboard
                        "email": user.email
                    }
                })
            else:
                return JsonResponse({"status": "error", "message": "Invalid username or password"}, status=401)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
            
    return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)
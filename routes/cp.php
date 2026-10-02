<?php

use Illuminate\Support\Facades\Route;
use Vizuall\UploadVideo\Http\UploadController;

Route::post('upload-video', [UploadController::class, 'store'])->name('upload-video.store');
Route::post('upload-video/poster', [UploadController::class, 'posterAsset'])->name('upload-video.poster-asset');
Route::post('upload-video/{id}/poster', [UploadController::class, 'poster'])->name('upload-video.poster');
Route::delete('upload-video/{id}', [UploadController::class, 'destroy'])->name('upload-video.destroy');
Route::get('upload-video/{id}', [UploadController::class, 'preview'])->name('upload-video.preview');

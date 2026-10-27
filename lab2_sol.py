import os
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()
driver.get("https://胡言.tw/lab2")
result = driver.find_element(By.ID, "result")      

for b in driver.find_elements(By.CLASS_NAME, "btn"):
    b.click()
    if result.text.startswith("HackSir"): 
        print(b.text, result.text)
        break
# HackSir{YOUGOTHEFLAG}
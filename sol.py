import os
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()
driver.get("https://胡言.tw/")

divs = driver.find_elements(By.CLASS_NAME, "item")
for d in divs:
    t = d.get_attribute("textContent")
    if "HackSir" in t:
        print(t)
# HackSir{YOUGOTHEFLAG}